import {mkdir,readFile,writeFile,rename,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';

export const digest=value=>createHash('sha256').update(value).digest('hex');
export function conflict(message){const e=new Error(message);e.status=409;return e;}
export async function withLock(path,fn){
  await mkdir(join(path,'..'),{recursive:true,mode:0o700});
  const deadline=Date.now()+5000;
  while(true){try{await mkdir(path,{mode:0o700});await writeFile(join(path,'owner'),String(process.pid),{mode:0o600});break;}catch(e){if(e.code!=='EEXIST')throw e;try{const pid=Number(await readFile(join(path,'owner'),'utf8'));try{process.kill(pid,0);}catch(err){if(err.code==='ESRCH'){await rm(path,{recursive:true,force:true});continue;}}}catch{}if(Date.now()>deadline)throw conflict('Another window is saving. Try again shortly.');await new Promise(r=>setTimeout(r,30));}}
  try{return await fn();}finally{await rm(path,{recursive:true,force:true});}
}
export async function atomicJson(path,value){const temp=path+'.'+randomUUID()+'.tmp';try{await writeFile(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});await rename(temp,path);}finally{await rm(temp,{force:true});}}
const empty=()=>({version:1,drafts:{},session:{openThreads:[],activeThread:null,archived:false},settings:{notifications:false,notificationPreview:false}});
export class ClientStore{
  constructor(dir){this.dir=dir;this.path=join(dir,'client-state.json');}
  async read(){try{return {...empty(),...JSON.parse(await readFile(this.path,'utf8'))};}catch(e){if(e.code==='ENOENT')return empty();throw new Error('Local client state could not be read. It has been preserved for recovery.');}}
  async update(patch){await mkdir(this.dir,{recursive:true,mode:0o700});return withLock(join(this.dir,'state.lock'),async()=>{
    const state=await this.read();
    if(patch.draft){const d=patch.draft;if(typeof d.key!=='string'||d.key.length>160||!/^([a-zA-Z0-9_-]+)$/.test(d.key)||typeof d.text!=='string'||d.text.length>1048576)throw new Error('Invalid draft');const old=state.drafts[d.key],attachments=Array.isArray(d.attachments)?d.attachments.slice(0,30):[],same=old&&old.text===d.text&&JSON.stringify(old.attachments)===JSON.stringify(attachments);if(!same&&(old?.revision??null)!==(d.expectedRevision??null))throw conflict('This draft changed in another window. Your text is still in this window; reload the saved draft before replacing it.');if(!same)state.drafts[d.key]={text:d.text,attachments,revision:randomUUID(),updatedAt:Date.now()};}
    if(patch.session){const s=patch.session;state.session={...state.session,...s,openThreads:(Array.isArray(s.openThreads)?s.openThreads:state.session.openThreads).filter(id=>typeof id==='string'&&/^[a-zA-Z0-9_-]+$/.test(id)).slice(0,30)};}
    if(patch.settings){for(const key of ['notifications','notificationPreview'])if(typeof patch.settings[key]==='boolean')state.settings[key]=patch.settings[key];}
    await atomicJson(this.path,state);return state;
  });}
}
