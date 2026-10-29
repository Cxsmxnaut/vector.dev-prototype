import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {GitService,run,accountFor,githubRepo,parseStatus} from '../server/git.mjs';

test('GitHub identities depend on suite membership rather than owner alone',()=>{assert.equal(accountFor('/work/other','https://github.com/Cxsmxnaut/unrelated.git'),'lolakapuri1');assert.equal(accountFor('/work/a','https://github.com/Cxsmxnaut/grademaxxing.git'),'Cxsmxnaut');assert.equal(accountFor('/work/grademaxxing-preprod'),'Cxsmxnaut');assert.equal(githubRepo('https://evil.test/user/repo.git'),null);assert.equal(githubRepo('git@github.com:user/repo.git').full,'user/repo');});
test('porcelain parser preserves spaces and rename source paths',()=>{assert.deepEqual(parseStatus('R  new name\0old name\0?? fresh file\0'),[{path:'new name',index:'R',worktree:' ',untracked:false,originalPath:'old name'},{path:'fresh file',index:'?',worktree:'?',untracked:true}]);});
test('Git workflow refuses stale previews, scopes author identity, and creates an isolated worktree',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'hc-git-'));const root=join(dir,'repo');await mkdir(root);
  const git=new GitService(join(dir,'locks'),{identity:async account=>({login:account,email:'test@example.test',env:{}})});
  try{
    await run('git',['init','-b','main',root]);await writeFile(join(root,'file with spaces.txt'),'initial\n');let s=await git.snapshot(root);const stale=s.revision;await writeFile(join(root,'file with spaces.txt'),'updated\n');await assert.rejects(git.mutate({cwd:root,action:'stage',paths:['file with spaces.txt'],expectedRevision:stale}),/repository changed/);
    s=await git.snapshot(root);await assert.rejects(git.mutate({cwd:root,action:'stage',paths:['../escape'],expectedRevision:s.revision}),/valid repository/);
    s=await git.mutate({cwd:root,action:'stage',paths:['file with spaces.txt'],expectedRevision:s.revision});assert.ok(s.stagedDiff.includes('updated'));s=await git.mutate({cwd:root,action:'commit',message:'Test scoped commit',expectedRevision:s.revision});assert.equal(s.files.length,0);assert.equal((await run('git',['-C',root,'log','-1','--format=%an|%ae'])).stdout.trim(),'lolakapuri1|test@example.test');
    const localIdentity=await run('git',['-C',root,'config','--local','--get','user.name']).catch(()=>null);assert.equal(localIdentity,null);
    s=await git.mutate({cwd:root,action:'branch',branch:'feature/local',expectedRevision:s.revision});assert.equal(s.branch,'feature/local');
    s=await git.mutate({cwd:root,action:'worktree',branch:'feature/worktree',path:join(dir,'worktree'),expectedRevision:s.revision});assert.equal(s.worktrees.length,2);assert.equal(await readFile(join(dir,'worktree','file with spaces.txt'),'utf8'),'updated\n');
    await writeFile(join(root,'file with spaces.txt'),'dirty');s=await git.snapshot(root);await assert.rejects(git.mutate({cwd:root,action:'switch',branch:'main',expectedRevision:s.revision}),/Commit or stash/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
