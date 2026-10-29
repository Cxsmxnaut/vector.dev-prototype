import test from 'node:test';
import assert from 'node:assert/strict';
import {CodexRpc} from '../server/rpc.mjs';
test('RPC matches out-of-order responses and routes server requests independently',async()=>{
  const rpc=new CodexRpc();const sent=[];rpc.child={stdin:{writable:true,write:m=>sent.push(JSON.parse(m))}};
  const a=rpc.call('one'),b=rpc.call('two');rpc.receive({id:sent[1].id,result:2});rpc.receive({id:sent[0].id,result:1});assert.deepEqual(await Promise.all([a,b]),[1,2]);
  const events=[];rpc.on('event',e=>events.push(e));rpc.receive({id:'approval',method:'item/fileChange/requestApproval',params:{threadId:'thread'}});assert.equal(rpc.requests.size,1);rpc.respond('approval',{decision:'decline'});assert.equal(rpc.requests.size,0);assert.deepEqual(sent.at(-1),{id:'approval',result:{decision:'decline'}});assert.equal(events.at(-1).method,'vector/requestResolved');
});
test('RPC reports backend errors and rejects all outstanding work on disconnect',async()=>{const rpc=new CodexRpc();rpc.child={stdin:{writable:true,write:()=>{}}};const p=rpc.call('a');rpc.receive({id:1,error:{code:123,message:'Locked by another writer'}});await assert.rejects(p,/Locked by another writer/);const q=rpc.call('b');rpc.fail(new Error('Disconnected'));await assert.rejects(q,/Disconnected/);assert.equal(rpc.pending.size,0);});
