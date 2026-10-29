import {spawn} from 'node:child_process';
import {realpath,mkdtemp,writeFile,rm,lstat,readFile,readlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute,relative} from 'node:path';
import {digest,conflict,withLock} from './store.mjs';

export function run(binary,args,{cwd,env={},input,timeout=30000}={}){
  return new Promise((resolve,reject)=>{const child=spawn(binary,args,{cwd,env:{...process.env,PATH:'/opt/homebrew/bin:/usr/local/bin:'+(process.env.PATH??'/usr/bin:/bin'),...env},stdio:['pipe','pipe','pipe']});let stdout='',stderr='',bytes=0,failed=false;
    const stop=message=>{if(failed)return;failed=true;child.kill();reject(new Error(message));};const timer=setTimeout(()=>stop('Command timed out; inspect the repository before retrying'),timeout);
    const add=(target,chunk)=>{bytes+=chunk.length;if(bytes>8*1024*1024)return stop('Output exceeded 8 MB');if(target==='stdout')stdout+=chunk.toString();else stderr+=chunk.toString();};child.stdout.on('data',d=>add('stdout',d));child.stderr.on('data',d=>add('stderr',d));child.on('error',e=>{clearTimeout(timer);if(!failed){failed=true;reject(e);}});child.on('close',code=>{clearTimeout(timer);if(failed)return;if(code!==0){const e=new Error(stderr.trim()||stdout.trim()||`${binary} exited (${code})`);e.code=code;reject(e);}else resolve({stdout,stderr});});child.stdin.on('error',()=>{});child.stdin.end(input??'');
  });
}
export function githubRepo(remote){const m=/^(?:https:\/\/github\.com\/|git@github\.com:)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(remote.trim());return m?{owner:m[1],name:m[2],full:m[1]+'/'+m[2]}:null;}
export function accountFor(root,remote=''){const repo=githubRepo(remote);const name=repo?.name??root.split('/').at(-1);return /^grademaxxing(?:[-_].*)?$/i.test(name)?'Cxsmxnaut':'lolakapuri1';}
export function parseStatus(raw){const parts=raw.split('\0'),files=[];for(let i=0;i<parts.length;i++){const row=parts[i];if(!row)continue;const code=row.slice(0,2),path=row.slice(3);const entry={path,index:code[0],worktree:code[1],untracked:code==='??'};if(/[RC]/.test(code))entry.originalPath=parts[++i];files.push(entry);}return files;}
export class GitService{
  constructor(dir,{identity}={}){this.dir=dir;this.identity=identity??this.githubIdentity.bind(this);}
  async git(cwd,args,options={}){const env={GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0',GIT_DIR:undefined,GIT_WORK_TREE:undefined,GIT_INDEX_FILE:undefined,...options.env};return run('git',['--no-optional-locks','--literal-pathspecs','-C',cwd,...args],{...options,env});}
  async root(cwd){if(!isAbsolute(cwd))throw new Error('Select an absolute repository folder');return(await this.git(await realpath(cwd),['rev-parse','--show-toplevel'])).stdout.trim();}
  async snapshot(cwd){const root=await this.root(cwd);const [status,branch,head,staged,diff,remote,branches,worktrees]=await Promise.all([
    this.git(root,['status','--porcelain=v1','-z','--untracked-files=all']),this.git(root,['symbolic-ref','--short','HEAD']).catch(()=>({stdout:'(detached HEAD)'})),this.git(root,['rev-parse','HEAD']).catch(()=>({stdout:'unborn'})),this.git(root,['diff','--cached','--binary','--no-ext-diff','--no-textconv']),this.git(root,['diff','--binary','--no-ext-diff','--no-textconv']),this.git(root,['remote','get-url','origin']).catch(()=>({stdout:''})),this.git(root,['for-each-ref','--format=%(refname:short)','refs/heads/']),this.git(root,['worktree','list','--porcelain'])]);
    const files=parseStatus(status.stdout);if(files.length>3000)throw new Error('This repository has too many changed files for the Git panel');
    const fileVersions=[];for(const file of files){try{const path=join(root,file.path),s=await lstat(path);if(s.size>8*1024*1024)throw new Error('A changed file exceeds the Git panel limit of 8 MB');fileVersions.push(file.path,s.isSymbolicLink()?await readlink(path):s.isFile()?digest(await readFile(path)):String(s.mtimeMs));}catch(e){if(e.code==='ENOENT')fileVersions.push(file.path,'deleted');else throw e;}}
    const revision=digest([status.stdout,head.stdout,staged.stdout,diff.stdout,branches.stdout,worktrees.stdout,...fileVersions].join('\0'));
    return{root,branch:branch.stdout.trim(),head:head.stdout.trim(),files,stagedDiff:staged.stdout,diff:diff.stdout,origin:remote.stdout.trim(),branches:branches.stdout.trim().split('\n').filter(Boolean),worktrees:worktrees.stdout.trim().split('\n\n').filter(Boolean).map(block=>Object.fromEntries(block.split('\n').map(l=>{const index=l.indexOf(' ');return index<0?[l,true]:[l.slice(0,index),l.slice(index+1)];}))),revision,account:accountFor(root,remote.stdout)};
  }
  async githubIdentity(account){const token=(await run('gh',['auth','token','--user',account],{env:{GH_TOKEN:undefined,GITHUB_TOKEN:undefined,GH_HOST:'github.com'}})).stdout.trim();const env={GH_TOKEN:token,GITHUB_TOKEN:undefined,GH_HOST:'github.com'};const user=JSON.parse((await run('gh',['api','user'],{env})).stdout);if(user.login.toLowerCase()!==account.toLowerCase())throw new Error('GitHub account verification failed');return{login:user.login,email:user.email||`${user.id}+${user.login}@users.noreply.github.com`,env};}
  async diff(cwd,path,staged=false){const root=await this.root(cwd);this.validatePaths(root,[path]);const status=await this.snapshot(root);const file=status.files.find(f=>f.path===path);if(!file)throw new Error('This file is not currently changed');if(file.untracked){const {readFile,stat}=await import('node:fs/promises');const actual=await realpath(join(root,path));if(!this.inside(root,actual))throw new Error('Untracked symlink points outside the repository');if((await stat(actual)).size>1024*1024)throw new Error('File is too large to preview');const bytes=await readFile(actual);if(bytes.includes(0))return{diff:'Binary file'};return{diff:bytes.toString()};}return{diff:(await this.git(root,['diff',...staged?['--cached']:[],'--no-ext-diff','--no-textconv','--',path])).stdout};}
  inside(root,path){const rel=relative(root,path);return !isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../');}
  validatePaths(root,paths){if(!Array.isArray(paths)||!paths.length||paths.some(p=>typeof p!=='string'||!p||isAbsolute(p)||!this.inside(root,join(root,p))||p.includes('\0')))throw new Error('Select valid repository-relative paths');}
  async mutate({cwd,action,expectedRevision,...args}){
    const root=await this.root(cwd);
    return withLock(join(this.dir,digest(root)+'.lock'),async()=>{
      const before=await this.snapshot(root);if(!expectedRevision||before.revision!==expectedRevision)throw conflict('The repository changed. Refresh and review it before retrying.');
      if(action==='stage'||action==='unstage'){
        this.validatePaths(root,args.paths);if(args.paths.some(p=>!before.files.some(f=>f.path===p||f.originalPath===p)))throw new Error('A selected file is no longer changed');
        if(action==='stage')await this.git(root,['add','--',...args.paths]);
        else if(before.head==='unborn')await this.git(root,['rm','--cached','--',...args.paths]);
        else await this.git(root,['restore','--staged','--',...args.paths]);
      }else if(action==='commit'){
        if(!before.stagedDiff||typeof args.message!=='string'||!args.message.trim())throw new Error('Stage changes and enter a commit message');const id=await this.identity(before.account);
        await this.git(root,['-c',`user.name=${id.login}`,'-c',`user.email=${id.email}`,'commit','--file','-'],{input:args.message,env:{GIT_AUTHOR_NAME:id.login,GIT_AUTHOR_EMAIL:id.email,GIT_COMMITTER_NAME:id.login,GIT_COMMITTER_EMAIL:id.email}});
      }else if(action==='switch'||action==='branch'){
        if(before.files.length)throw new Error('Commit or stash your changes before switching branches');await this.git(root,['check-ref-format','--branch',args.branch??'']);if(action==='switch'&&!before.branches.includes(args.branch))throw new Error('Select an existing local branch');await this.git(root,['switch',...action==='branch'?['-c']:[],args.branch]);
      }else if(action==='worktree'){
        if(!isAbsolute(args.path??''))throw new Error('Choose an absolute path for the new worktree');await this.git(root,['check-ref-format','--branch',args.branch??'']);await this.git(root,['worktree','add','-b',args.branch,'--',args.path]);
      }else if(action==='push'){
        if(!/^https:\/\/github\.com\//.test(before.origin)||!githubRepo(before.origin))throw new Error('Push requires an HTTPS GitHub origin so the requested account can be enforced');if(before.branch==='(detached HEAD)')throw new Error('Switch to a branch before pushing');const id=await this.identity(before.account);await this.git(root,['-c','credential.helper=','-c','credential.helper=!gh auth git-credential','push','--set-upstream','origin',before.branch],{env:id.env,timeout:90000});
      }else if(action==='pullRequest'){
        const repo=githubRepo(before.origin);if(!repo)throw new Error('This origin is not a GitHub repository');if(!args.title?.trim()||!args.base?.trim())throw new Error('Enter a PR title and base branch');const id=await this.identity(before.account),dir=await mkdtemp(join(tmpdir(),'vector-pr-'));
        try{const body=join(dir,'body.txt');await writeFile(body,String(args.body??''),{mode:0o600});const result=await run('gh',['pr','create','--draft','--repo',repo.full,'--head',before.branch,'--base',args.base,'--title',args.title,'--body-file',body],{cwd:root,env:id.env,timeout:90000});return{...await this.snapshot(root),message:result.stdout.trim()};}finally{await rm(dir,{recursive:true,force:true});}
      }else throw new Error('Unknown Git action');
      return await this.snapshot(root);
    });
  }
}
