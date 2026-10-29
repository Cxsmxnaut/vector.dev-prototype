import {readFile,mkdir,open} from 'node:fs/promises';
import {spawn,execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url)),runtime=join(root,'.runtime');
await mkdir(runtime,{recursive:true,mode:0o700});
async function connection(){try{const c=JSON.parse(await readFile(join(runtime,'connection.json'),'utf8'));if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(c.origin)||!c.controlToken)return null;const r=await fetch(c.origin+'/api/status',{headers:{Authorization:'Bearer '+c.controlToken},signal:AbortSignal.timeout(1500)});return r.ok?c:null;}catch{return null;}}
let c=await connection();
if(!c){
  const log=await open(join(runtime,'server.log'),'a',0o600);
  const child=spawn(process.execPath,[join(root,'server/main.mjs')],{cwd:root,env:{...process.env,PORT:'0'},detached:true,stdio:['ignore',log.fd,log.fd]});child.unref();await log.close();
  const start=Date.now();while(!c&&Date.now()-start<15000){await new Promise(r=>setTimeout(r,250));c=await connection();}
}
if(!c)throw new Error('Could not start vector.dev. See .runtime/server.log.');
const response=await fetch(c.origin+'/api/new-link',{method:'POST',headers:{Authorization:'Bearer '+c.controlToken,'Content-Type':'application/json'},body:'{}'});
if(!response.ok)throw new Error('Could not create a fresh browser connection. Restart the server.');
const {url}=await response.json();
if(!process.argv.includes('--no-open'))await new Promise((resolve,reject)=>execFile('/usr/bin/open',[url],e=>e?reject(e):resolve()));
console.log(`vector.dev is ready at ${c.origin}. A fresh private link is saved in .runtime/connection.json.`);
