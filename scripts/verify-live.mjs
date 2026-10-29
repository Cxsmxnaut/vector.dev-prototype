import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {CodexRpc} from '../server/rpc.mjs';
import {readSidebar} from '../server/sidebar.mjs';

const dir=await mkdtemp(join(tmpdir(),'vector.dev-live-'));
const rpc=new CodexRpc();const report={checkedAt:new Date().toISOString(),checks:[]};
const record=(name,detail)=>{report.checks.push({name,ok:true,...detail});console.log('PASS',name,detail??'');};
try{
  await rpc.start();record('Initialize installed Codex backend');
  const sidebar=await readSidebar(rpc,process.env.CODEX_HOME??join(homedir(),'.codex'));record('Read shared local history and host projects',sidebar.counts);
  const models=await rpc.call('model/list',{});assert.ok(models.data.length);record('Discover available models',{count:models.data.length});
  const path=join(dir,'fixture.txt');const dataBase64=Buffer.from('VECTOR_FILE_CHECK\n').toString('base64');
  await rpc.call('fs/writeFile',{path,dataBase64});assert.equal((await rpc.call('fs/readFile',{path})).dataBase64,dataBase64);assert.ok((await rpc.call('fs/readDirectory',{path:dir})).entries.some(e=>e.fileName==='fixture.txt'));record('Write, read and list a disposable file');
  const command=await rpc.call('command/exec',{command:['/usr/bin/printf','VECTOR_COMMAND_CHECK'],cwd:dir,timeoutMs:10000});assert.equal(command.stdout,'VECTOR_COMMAND_CHECK');record('Execute a sandboxed command');
  const processHandle=randomUUID();let output='';
  const exit=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Host process timeout')),15000);const listener=m=>{if(m.params?.processHandle!==processHandle)return;if(m.method==='process/outputDelta')output+=Buffer.from(m.params.deltaBase64,'base64').toString();if(m.method==='process/exited'){clearTimeout(timer);rpc.off('event',listener);resolve(m.params);}};rpc.on('event',listener);});
  await rpc.call('process/spawn',{command:['/bin/zsh','-f','-c',"printf VECTOR_PTY_CHECK"],processHandle,cwd:dir,tty:true,timeoutMs:10000});const result=await exit;assert.equal(result.exitCode,0);assert.ok(output.includes('VECTOR_PTY_CHECK'));record('Stream a native host PTY');
  if(process.argv.includes('--inference')){
    const model=models.data.find(m=>m.isDefault)?.model??models.data[0].model;
    const {thread}=await rpc.call('thread/start',{ephemeral:true,cwd:dir,model,sandbox:'read-only',approvalPolicy:'never'});
    let text='';const completion=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Inference verification timeout')),120000);const listener=m=>{if(m.params?.threadId!==thread.id)return;if(m.method==='item/agentMessage/delta')text+=m.params.delta;if(m.method==='turn/completed'){clearTimeout(timer);rpc.off('event',listener);resolve(m.params.turn);}};rpc.on('event',listener);});
    await rpc.call('turn/start',{threadId:thread.id,input:[{type:'text',text:'Reply exactly VECTOR_INFERENCE_OK. Do not use tools or change files.',text_elements:[]}]});
    const turn=await completion;assert.equal(turn.status,'completed');assert.ok(text.includes('VECTOR_INFERENCE_OK'));record('Complete and stream an ephemeral model turn');
  }
  await mkdir(new URL('../evidence/',import.meta.url),{recursive:true});await writeFile(new URL('../evidence/live-verification.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
}finally{rpc.close();await rm(dir,{recursive:true,force:true});}
