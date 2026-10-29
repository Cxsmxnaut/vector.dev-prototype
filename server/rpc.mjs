import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {EventEmitter} from 'node:events';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

export function findCodex(){
  const paths=[process.env.VECTOR_CODEX_BIN,'/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex','/Applications/Codex.app/Contents/Resources/codex','/opt/homebrew/bin/codex'];
  return paths.find(p=>p&&existsSync(p))??'codex';
}
export class CodexRpc extends EventEmitter {
  constructor({binary=findCodex(),home,timeout=60000}={}){super();this.binary=binary;this.home=home;this.timeout=timeout;this.next=0;this.pending=new Map();this.requests=new Map();this.ready=false;}
  async start(){
    if(this.child&&this.child.exitCode===null&&!this.child.killed)throw new Error('The backend is still running');
    this.requests.clear();const generation=(this.generation??0)+1;this.generation=generation;
    this.child=spawn(this.binary,['app-server','--listen','stdio://'],{stdio:['pipe','pipe','pipe'],env:{...process.env,...this.home?{CODEX_HOME:this.home}:{}}});
    // Never log configuration, transcripts, or authentication material from stderr.
    this.child.stderr.on('data',()=>{});
    createInterface({input:this.child.stdout}).on('line',line=>{if(this.generation!==generation)return;let m;try{m=JSON.parse(line);}catch{return;}this.receive(m);});
    this.child.on('error',e=>this.fail(e));
    this.child.on('exit',(code,signal)=>{if(this.generation!==generation)return;this.ready=false;this.requests.clear();this.fail(new Error(`Codex backend exited (${code??signal})`));this.emit('offline');});
    const info=await this.call('initialize',{clientInfo:{name:'vector_dev',title:'vector.dev',version:'0.2.0'},capabilities:{experimentalApi:true}});
    this.notify('initialized');this.ready=true;this.info=info;return info;
  }
  receive(m){
    if(m.method){
      if(m.id!==undefined)this.requests.set(String(m.id),m);
      if(m.method==='serverRequest/resolved')this.requests.delete(String(m.params?.requestId));
      this.emit('event',m);return;
    }
    const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);
    if(m.error){const e=new Error(m.error.message);e.code=m.error.code;e.data=m.error.data;p.reject(e);}else p.resolve(m.result);
  }
  send(m){if(!this.child?.stdin.writable)throw new Error('Codex backend is disconnected');this.child.stdin.write(JSON.stringify(m)+'\n');}
  notify(method,params){this.send({method,...params===undefined?{}:{params}});}
  call(method,params={},timeout=this.timeout){
    const id=++this.next;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`${method} timed out; its outcome may still be pending`));},timeout);timer.unref?.();
      this.pending.set(id,{resolve,reject,timer});try{this.send({id,method,params});}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}
    });
  }
  respond(id,result,error){const r=this.requests.get(String(id));if(!r)throw new Error('This request is no longer pending');this.send({id:r.id,...error?{error}:{result}});this.requests.delete(String(id));this.emit('event',{method:'vector/requestResolved',params:{requestId:id}});}
  async list(method,params={}){const data=[];let cursor;const seen=new Set();do{const p=await this.call(method,{...params,limit:100,...cursor?{cursor}:{}});data.push(...p.data);cursor=p.nextCursor;if(cursor&&seen.has(cursor))throw new Error('Backend returned a repeated pagination cursor');seen.add(cursor);}while(cursor);return data;}
  fail(e){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(e);}this.pending.clear();}
  async stop(){const child=this.child;this.close();if(child&&child.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},3000);child.once('exit',()=>{clearTimeout(timer);resolve();});});}
  close(){this.ready=false;this.fail(new Error('Backend closed'));this.child?.stdin.end();this.child?.kill();}
}

// Generated from the installed host binary; unsupported desktop services are not invented.
export function protocolMethods(){
  const root=fileURLToPath(new URL('../protocol/',import.meta.url));
  if(!existsSync(join(root,'ClientRequest.ts')))return JSON.parse(readFileSync(fileURLToPath(new URL('./methods.json',import.meta.url)),'utf8'));
  const request=readFileSync(join(root,'ClientRequest.ts'),'utf8');
  return [...request.matchAll(/"method": "([^"]+)"/g)].map(m=>m[1]).filter(m=>m!=='initialize');
}
