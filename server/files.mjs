import {readFile,writeFile,stat,realpath,rename,rm,readdir,mkdir,chmod} from 'node:fs/promises';
import {join,relative,isAbsolute,dirname,basename,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {digest,conflict,withLock,atomicJson} from './store.mjs';
const exec=promisify(execFile),limit=1024*1024;
const contains=(root,path)=>{const rel=relative(root,path);return !isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../');};
export class WorkspaceFiles{
  constructor(dir){this.dir=dir;}
  async locate(root,path){if(!isAbsolute(root)||!isAbsolute(path))throw new Error('Use absolute workspace paths');const canonicalRoot=await realpath(root),canonical=await realpath(path);if(!contains(canonicalRoot,canonical))throw new Error('This file resolves outside the selected workspace');return canonical;}
  async read(root,path){const canonical=await this.locate(root,path),s=await stat(canonical);if(!s.isFile()||s.size>limit)throw new Error('The editor supports text files up to 1 MB');const bytes=await readFile(canonical);if(bytes.includes(0))throw new Error('This is a binary file');const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);return{path:canonical,text,revision:digest(bytes),size:bytes.length};}
  async backups(root,path){const canonical=await this.locate(root,path),dir=join(this.dir,digest(canonical));const names=await readdir(dir).catch(e=>{if(e.code==='ENOENT')return[];throw e;});const data=[];for(const name of names.filter(n=>n.endsWith('.json'))){const meta=JSON.parse(await readFile(join(dir,name),'utf8'));data.push({id:meta.id,createdAt:meta.createdAt,bytes:meta.bytes});}return data.sort((a,b)=>b.createdAt-a.createdAt);}
  async save({root,path,text,expectedRevision,backupId}){
    if(typeof text!=='string'&&!backupId)throw new Error('Missing file text');if(typeof text==='string'&&Buffer.byteLength(text)>limit)throw new Error('The editor supports text files up to 1 MB');
    const canonical=await this.locate(root,path);await mkdir(this.dir,{recursive:true,mode:0o700});const key=digest(canonical),dir=join(this.dir,key);
    return withLock(join(this.dir,key+'.lock'),async()=>{
      const current=await this.read(root,path);if(current.path!==canonical||current.revision!==expectedRevision)throw conflict('This file changed on disk. Reload it or copy your edits before saving.');
      if(backupId){if(!/^[a-f0-9-]{36}$/.test(backupId))throw new Error('Invalid backup');text=await readFile(join(dir,backupId+'.txt'),'utf8');}
      await mkdir(dir,{recursive:true,mode:0o700});const id=randomUUID();await writeFile(join(dir,id+'.txt'),current.text,{mode:0o600,flag:'wx'});await atomicJson(join(dir,id+'.json'),{id,path:canonical,createdAt:Date.now(),bytes:Buffer.byteLength(current.text)});
      const mode=(await stat(canonical)).mode&0o777;const temp=join(dirname(canonical),'.'+basename(canonical)+'.vector-'+randomUUID());
      try{await writeFile(temp,text,{mode,flag:'wx'});await chmod(temp,mode);if((await this.read(root,path)).revision!==expectedRevision)throw conflict('The file changed while saving. Your edits remain in the editor.');await rename(temp,canonical);}finally{await rm(temp,{force:true});}
      return {...await this.read(root,path),backupId:id};
    });
  }
  async search(root,query){if(typeof query!=='string'||query.length<2||query.length>200)throw new Error('Search for 2–200 characters');const canonical=await realpath(root);let output='';let truncated=false;try{output=(await exec('/opt/homebrew/bin/rg',['--json','--fixed-strings','--max-count','3','--max-filesize','1M','--glob','!.git','-e',query,'--','.'],{cwd:canonical,maxBuffer:2*1024*1024,timeout:10000})).stdout;}catch(e){if(e.code===1)return{matches:[],truncated:false};if(e.stdout){output=e.stdout;truncated=true;}else throw new Error('Project search failed: '+(e.stderr||e.message));}const matches=[];for(const line of output.split('\n')){try{const r=JSON.parse(line);if(r.type!=='match'||!r.data.path.text)continue;const path=resolve(canonical,r.data.path.text);if(!contains(canonical,path))continue;matches.push({path,line:r.data.line_number,text:r.data.lines.text.slice(0,400)});if(matches.length===200){truncated=true;break;}}catch{}}return{matches,truncated};}
}
