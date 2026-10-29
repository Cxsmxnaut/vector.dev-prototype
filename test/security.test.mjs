import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EventEmitter} from 'node:events';
import http from 'node:http';
import {createApp} from '../server/main.mjs';
import {createAccess} from '../server/security.mjs';

test('connection capabilities are single use and reject mismatches without Unicode errors',()=>{const a=createAccess();assert.equal(a.redeem('x'),false);assert.equal(a.redeem('é'.repeat(64)),false);assert.equal(a.redeem(a.token),true);assert.equal(a.redeem(a.token),false);assert.ok(a.cookie.includes('HttpOnly; SameSite=Strict'));});
test('a fresh connection invalidates old links without changing the authenticated session',()=>{const a=createAccess(),old=a.token,cookie=a.cookie,control=a.controlToken;const fresh=a.issue();assert.notEqual(fresh,old);assert.equal(a.redeem(old),false);assert.equal(a.redeem(fresh),true);assert.equal(a.cookie,cookie);assert.ok(a.authorized({headers:{authorization:'Bearer '+control}}));assert.equal(a.authorized({headers:{authorization:'Bearer '+fresh}}),false);});
test('local gateway isolates private data, rejects foreign origins, and validates RPC methods',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vector.dev-test-'));const rpc=new EventEmitter();rpc.requests=new Map();rpc.ready=true;rpc.close=()=>{};rpc.call=async(method,params)=>({method,params});
  const app=await createApp({port:0,rpc,startBackend:false,runtime:dir,home:dir});
  try{
    assert.equal((await fetch(app.origin+'/api/status')).status,401);
    assert.equal((await fetch(app.origin+'/.runtime/connection.json')).status,401);
    assert.equal((await fetch(app.origin+'/health',{headers:{Origin:'https://evil.test'}})).status,403);
    const foreignHost=await new Promise((resolve,reject)=>{const request=http.get(app.origin+'/health',{headers:{Host:'evil.test'}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);});assert.equal(foreignHost,403);
    const login=await fetch(app.url,{redirect:'manual'});assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(app.url,{redirect:'manual'})).status,403);
    assert.equal((await fetch(app.origin+'/api/status',{headers:{cookie}})).status,200);
    assert.equal((await fetch(app.origin+'/api/unknown',{headers:{cookie}})).status,404);
    assert.equal((await fetch(app.origin+'/.runtime/connection.json',{headers:{cookie}})).status,404);
    assert.equal((await fetch(app.origin+'/api/rpc',{method:'POST',headers:{cookie,'Content-Type':'text/plain'},body:'{}'})).status,415);
    assert.equal((await fetch(app.origin+'/api/rpc',{method:'POST',headers:{cookie,'Content-Type':'application/json',Origin:'https://evil.test'},body:'{}'})).status,403);
    const unknown=await fetch(app.origin+'/api/rpc',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({method:'invented-method'})});assert.equal(unknown.status,400);
    const valid=await fetch(app.origin+'/api/rpc',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:JSON.stringify({method:'thread/read',params:{threadId:'test'}})});assert.deepEqual((await valid.json()).result,{method:'thread/read',params:{threadId:'test'}});
    assert.equal((await fetch(app.origin+'/api/asset?path=/etc/passwd',{headers:{cookie}})).status,403);
  }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
test('event reconnection replays missed completion and restores current task state',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'hc-stream-'));const rpc=new EventEmitter();rpc.requests=new Map();rpc.ready=true;rpc.close=()=>{};rpc.list=async()=>[];
  const app=await createApp({port:0,rpc,startBackend:false,runtime:dir,home:dir});const headers={Authorization:'Bearer '+app.access.controlToken};let reader,second;
  async function until(r,needle){let text='';const deadline=Date.now()+3000;while(!text.includes(needle)&&Date.now()<deadline){const value=await r.read();if(value.done)break;text+=new TextDecoder().decode(value.value);}assert.ok(text.includes(needle),'Missing expected stream event');return text;}
  try{
    const stream=await fetch(app.origin+'/api/events',{headers,signal:AbortSignal.timeout(5000)});reader=stream.body.getReader();rpc.emit('event',{method:'turn/started',params:{threadId:'thread',turn:{id:'turn',items:[],status:'inProgress'}}});const first=await until(reader,'turn/started');const id=/id: ([^\n]+)/.exec(first)[1];assert.equal((await(await fetch(app.origin+'/api/status',{headers})).json()).activeTurns.length,1);await reader.cancel();
    rpc.emit('event',{method:'turn/completed',params:{threadId:'thread',turn:{id:'turn',items:[],status:'completed'}}});
    const replay=await fetch(app.origin+'/api/events',{headers:{...headers,'Last-Event-ID':id},signal:AbortSignal.timeout(5000)});second=replay.body.getReader();await until(second,'turn/completed');assert.equal((await(await fetch(app.origin+'/api/status',{headers})).json()).activeTurns.length,0);
  }finally{await reader?.cancel().catch(()=>{});await second?.cancel().catch(()=>{});await app.close();await rm(dir,{recursive:true,force:true});}
});
