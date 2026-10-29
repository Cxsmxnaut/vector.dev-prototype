import http from 'node:http';
import {readFile,mkdir,writeFile,unlink,readdir} from 'node:fs/promises';
import {createReadStream,existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join,extname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {CodexRpc,protocolMethods} from './rpc.mjs';
import {readSidebar} from './sidebar.mjs';
import {createAccess} from './security.mjs';
import {ClientStore} from './store.mjs';
import {WorkspaceFiles} from './files.mjs';
import {GitService} from './git.mjs';
import {clientDataDir} from './data-paths.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2'};
export async function createApp({port=Number(process.env.PORT??4318),home=process.env.CODEX_HOME??join(homedir(),'.codex'),rpc=new CodexRpc({home}),runtime=join(root,'.runtime'),clientDir=clientDataDir(home),startBackend=true}={}){
  const access=createAccess();const clients=new Set();const methods=protocolMethods();let origin,closed=false,lastSidebar,lastError,refreshing,interval,restartTimer,restarting=false,restarts=0;
  const store=new ClientStore(clientDir),files=new WorkspaceFiles(join(clientDir,'backups')),git=new GitService(join(clientDir,'git-locks'));
  const activeTurns=new Map(),journal=[],boot=randomUUID();let eventSeq=0,journalBytes=0;
  function publish(event){const id=`${boot}:${++eventSeq}`,data=`id: ${id}\ndata: ${JSON.stringify(event)}\n\n`;journal.push({id,data});journalBytes+=Buffer.byteLength(data);while(journal.length>500||journalBytes>8*1024*1024)journalBytes-=Buffer.byteLength(journal.shift().data);for(const client of clients){if(client.writableLength>4*1024*1024){client.end();clients.delete(client);}else client.write(data);}}
  rpc.on('event',m=>{publish(m);if(m.method==='turn/started')activeTurns.set(m.params.threadId,{threadId:m.params.threadId,turnId:m.params.turn.id,status:'inProgress'});if(m.method==='turn/completed')activeTurns.delete(m.params.threadId);if(m.method==='turn/started'||m.method==='turn/completed')publish({method:'vector/activity',params:{activeTurns:[...activeTurns.values()]}});if(/^(thread\/(started|archived|unarchived|name\/updated|projectUpdated)|project\/changed|turn\/completed)/.test(m.method))void refresh();});
  rpc.on('offline',()=>{activeTurns.clear();publish({method:'vector/backend',params:{ready:false}});publish({method:'vector/activity',params:{activeTurns:[]}});if(startBackend&&!closed&&restarts<5){restartTimer=setTimeout(()=>void start(),Math.min(1000*2**restarts,15000));}});
  async function start(){if(closed||restarting||rpc.ready)return;restarting=true;try{restarts++;await rpc.start();lastError=null;publish({method:'vector/backend',params:{ready:true}});void refresh();}catch(e){lastError=e.message;publish({method:'vector/syncError',params:{message:e.message}});}finally{restarting=false;}}
  async function refresh(){
    if(!rpc.ready)return;
    if(refreshing)return refreshing;
    refreshing=(async()=>{try{const sidebar=await readSidebar(rpc,home);lastError=null;if(sidebar.revision!==lastSidebar?.revision){lastSidebar=sidebar;publish({method:'vector/sidebar',params:sidebar});}else lastSidebar.checkedAt=sidebar.checkedAt;return lastSidebar;}catch(e){lastError=e.message;publish({method:'vector/syncError',params:{message:e.message}});}finally{refreshing=null;}})();return refreshing;
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    try{
      if(!origin||!access.requestAllowed(req,origin))return json({error:'Foreign host or origin rejected'},403);
      const url=new URL(req.url,origin);
      if(url.pathname==='/health')return json({ok:true,backend:rpc.ready});
      if(url.pathname==='/connect'){
        if(req.method!=='GET'||!access.redeem(url.searchParams.get('token')))return json({error:'This connection link is invalid, expired, or already used. Open a fresh link from .runtime/connection.json.'},403);
        res.writeHead(303,{'Set-Cookie':access.cookie,Location:'/'});return res.end();
      }
      if(!access.authorized(req)){
        res.writeHead(401,{'Content-Type':'text/html; charset=utf-8'});return res.end('<!doctype html><title>vector.dev — connect</title><body style="background:#111313;color:#ddd;font:16px system-ui;max-width:560px;margin:15vh auto"><h1>Connect to your Mac</h1><p>Open the private connection link in this project’s <code>.runtime/connection.json</code>. Restart the server to issue a new link.</p></body>');
      }
      if(req.method==='GET'&&url.pathname==='/api/events'){
        res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(': connected\n\n');clients.add(res);
        const previous=journal.findIndex(e=>e.id===req.headers['last-event-id']);if(previous>=0)for(const e of journal.slice(previous+1))res.write(e.data);
        res.write(`data: ${JSON.stringify({method:'vector/backend',params:{ready:rpc.ready}})}\n\n`);
        res.write(`data: ${JSON.stringify({method:'vector/activity',params:{activeTurns:[...activeTurns.values()]}})}\n\n`);
        if(lastSidebar)res.write(`data: ${JSON.stringify({method:'vector/sidebar',params:lastSidebar})}\n\n`);
        for(const request of rpc.requests.values())res.write(`data: ${JSON.stringify(request)}\n\n`);
        const ping=setInterval(()=>res.write(': keepalive\n\n'),15000);req.on('close',()=>{clearInterval(ping);clients.delete(res);});return;
      }
      if(req.method==='GET'&&url.pathname==='/api/status')return json({ready:rpc.ready,binary:rpc.binary,home,methods,pendingRequests:[...rpc.requests.values()],activeTurns:[...activeTurns.values()],lastError,info:rpc.info,capabilities:{hostSidebarWrites:false,sharedLocalHistory:true,cloudThreads:false,hostedTools:false,voice:false,remoteAccess:false}});
      if(req.method==='GET'&&url.pathname==='/api/client-state')return json(await store.read());
      if(req.method==='GET'&&url.pathname==='/api/files/read')return json(await files.read(url.searchParams.get('root'),url.searchParams.get('path')));
      if(req.method==='GET'&&url.pathname==='/api/files/backups')return json({data:await files.backups(url.searchParams.get('root'),url.searchParams.get('path'))});
      if(req.method==='GET'&&url.pathname==='/api/files/search')return json(await files.search(url.searchParams.get('root'),url.searchParams.get('query')));
      if(req.method==='GET'&&url.pathname==='/api/git')return json(await git.snapshot(url.searchParams.get('cwd')));
      if(req.method==='GET'&&url.pathname==='/api/git/diff')return json(await git.diff(url.searchParams.get('cwd'),url.searchParams.get('path'),url.searchParams.get('staged')==='true'));
      if(req.method==='GET'&&url.pathname==='/api/sidebar'){
        const archived=url.searchParams.get('archived')==='true';
        const value=archived?await readSidebar(rpc,home,{archived}):lastSidebar??await refresh();
        if(!value)return json({error:lastError??'Codex is starting. Try again shortly.'},503);return json(value);
      }
      if(req.method==='GET'&&url.pathname==='/api/automations'){
        const dir=join(home,'automations');const names=await readdir(dir).catch(()=>[]);const data=[];
        for(const name of names){if(!/^[a-zA-Z0-9_-]+$/.test(name))continue;try{data.push({id:name,toml:await readFile(join(dir,name,'automation.toml'),'utf8')});}catch{}}
        return json({data,readOnly:true,schedulerOwnedByHost:true});
      }
      if(req.method==='GET'&&url.pathname==='/api/asset'){
        const filename=resolve(url.searchParams.get('path')??'');
        const roots=['attachments','generated_images','visualizations'].map(d=>join(home,d));
        if(!roots.some(r=>{const rel=relative(r,filename);return rel!==''&&!rel.startsWith('..')&&!isAbsolute(rel);}))return json({error:'Asset path is outside Codex media directories'},403);
        if(!['.png','.jpg','.jpeg','.webp','.gif'].includes(extname(filename)))return json({error:'Unsupported asset type'},415);
        const stream=createReadStream(filename);stream.on('error',()=>{if(!res.headersSent)json({error:'Asset unavailable'},404);else res.destroy();});res.setHeader('Content-Type',mime[extname(filename)]??'image/jpeg');stream.pipe(res);return;
      }
      if(req.method==='POST'&&url.pathname.startsWith('/api/')){
        if(!String(req.headers['content-type']).startsWith('application/json'))return json({error:'Use application/json'},415);
        let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>24*1024*1024){json({error:'Request too large'},413);return;}chunks.push(chunk);}
        const body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
        if(url.pathname==='/api/client-state')return json(await store.update(body));
        if(url.pathname==='/api/files/save')return json(await files.save(body));
        if(url.pathname==='/api/git/action')return json(await git.mutate(body));
        if(url.pathname==='/api/notifications/test'){rpc.emit('event',{method:'vector/notificationTest',params:{}});return json({ok:true});}
        if(url.pathname==='/api/backend/restart'){if(rpc.ready&&!body.confirmed)throw new Error('Restarting the backend stops its running tasks. Confirm this action first.');clearTimeout(restartTimer);restarts=0;await rpc.stop();await start();return json({ready:rpc.ready});}
        if(url.pathname==='/api/rpc'){
          if(!methods.includes(body.method))return json({error:'Method is not in the installed Codex protocol'},400);
          const result=await rpc.call(body.method,body.params??{},body.method==='command/exec'?(body.params?.disableTimeout?86400000:300000):60000);
          if(/^(thread\/(name\/set|archive|unarchive|metadata\/update)|project\/)/.test(body.method))void refresh();
          return json({result});
        }
        if(url.pathname==='/api/respond'){rpc.respond(body.id,body.result,body.error);return json({ok:true});}
        if(url.pathname==='/api/new-link'){const url=`${origin}/connect?token=${access.issue()}`;await writeConnection(url);return json({url});}
        if(url.pathname==='/api/refresh'){await refresh();return json({ok:true});}
        if(url.pathname==='/api/upload'){
          if(typeof body.data!=='string'||typeof body.name!=='string')return json({error:'Missing file data'},400);
          const data=Buffer.from(body.data,'base64');if(data.length>15*1024*1024)return json({error:'File exceeds 15 MB'},413);
          const name=body.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120)||'attachment';
          const dir=join(home,'attachments','vector.dev');await mkdir(dir,{recursive:true,mode:0o700});
          const path=join(dir,`${randomUUID()}-${name}`);await writeFile(path,data,{mode:0o600,flag:'wx'});return json({path,name});
        }
        return json({error:'Unknown endpoint'},404);
      }
      if(url.pathname.startsWith('/api/'))return json({error:'Unknown API endpoint'},404);
      if(req.method!=='GET')return json({error:'Method not allowed'},405);
      const dist=join(root,'dist');const path=resolve(dist,'.'+decodeURIComponent(url.pathname));
      const rel=relative(dist,path);if(rel.startsWith('..')||isAbsolute(rel))return json({error:'Invalid path'},403);
      let content;let ext=extname(path);
      try{content=await readFile(path);}catch{if(ext&&ext!=='.html')return json({error:'Not found'},404);content=await readFile(join(dist,'index.html'));ext='.html';}
      res.writeHead(200,{'Content-Type':mime[ext]??'application/octet-stream'});res.end(content);
    }catch(e){if(!res.headersSent)json({error:e.message,code:e.code},e.status??400);else res.end();}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  origin=`http://127.0.0.1:${server.address().port}`;
  await mkdir(runtime,{recursive:true,mode:0o700});
  const connectionFile=join(runtime,'connection.json');const url=`${origin}/connect?token=${access.token}`;
  async function writeConnection(url){await writeFile(connectionFile,JSON.stringify({url,origin,controlToken:access.controlToken,pid:process.pid,createdAt:new Date().toISOString()},null,2)+'\n',{mode:0o600});}
  await writeConnection(url);
  if(startBackend){void start();interval=setInterval(()=>void refresh(),5000);}
  return {server,rpc,origin,url,access,store,async close(){if(closed)return;closed=true;clearTimeout(restartTimer);clearInterval(interval);for(const c of clients)c.end();rpc.close();await new Promise(r=>server.close(r));await unlink(connectionFile).catch(()=>{});}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=await createApp();console.log(`vector.dev is listening at ${app.origin}. Open the private link in .runtime/connection.json.`);
  const stop=()=>{void app.close().then(()=>process.exit(0));};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
