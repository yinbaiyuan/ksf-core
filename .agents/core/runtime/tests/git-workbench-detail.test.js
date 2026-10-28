import{platform}from'../src/platform/index.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCoordinator } from '../src/services/workbench-common.js';
import { createWorkspaceFiles } from '../src/services/workspace-files.js';
import { createWorkbenchGit, runGit } from '../src/services/workbench-git.js';
async function fixture(t) {
 const root=await realpath(await mkdtemp(join(tmpdir(),'ksf-git-detail-'))); t.after(()=>rm(root,{recursive:true,force:true}));
 const path=join(root,'repositories/demo'); await mkdir(path,{recursive:true}); const run=args=>runGit(path,args);
 await run(['init','-b','main']);await run(['config','core.autocrlf','false']);await run(['config','user.name','测试作者']);await run(['config','user.email','test@example.invalid']);await run(['config','commit.gpgsign','false']);
 const coordinator=createCoordinator(),git=createWorkbenchGit(root,createWorkspaceFiles(root,coordinator),coordinator);
 const save=async(name,text)=>writeFile(join(path,name),text), commit=async(message)=>{await run(['add','--','.']);await run(['commit','-m',message]);return (await run(['rev-parse','HEAD'])).stdout.trim();};
 await save('说明.md','first\n');const first=await commit('initial [literal]');await git.scan();const repo=(await git.list()).repositories.find(r=>r.path==='repositories/demo');
 const op=async(action,input={})=>{const state=await git.status(repo.id),item=await git.start({repo:repo.id,action,version:state.version,requestId:crypto.randomUUID(),...input});while(['queued','running'].includes(item.status))await new Promise(r=>setTimeout(r,5));return item;};
 const must=async(action,input)=>{const item=await op(action,input);assert.equal(item.status,'completed',JSON.stringify(item.error));return item;};
 return {root,path,run,save,commit,first,git,repo,op,must};
}
test('history filters the entire history, follows renames, includes detached HEAD and paginates exactly',async t=>{
 const f=await fixture(t);for(let i=0;i<99;i++)await f.run(['commit','--allow-empty','-m',`entry ${i}`]);
 let page=await f.git.history(f.repo.id);assert.equal(page.commits.length,100);assert.equal(page.nextOffset,null);
 await f.run(['commit','--allow-empty','-m','NEEDLE unique']);page=await f.git.history(f.repo.id);assert.equal(page.nextOffset,100);assert.equal((await f.git.history(f.repo.id,{offset:100})).commits.length,1);
 assert.equal((await f.git.history(f.repo.id,{q:'needle'})).commits.length,1);assert.equal((await f.git.history(f.repo.id,{q:'[literal]'})).commits.length,1);assert.equal((await f.git.history(f.repo.id,{author:'不存在'})).commits.length,0);
 await f.run(['mv','说明.md','改名.md']);await f.commit('rename');assert.equal((await f.git.history(f.repo.id,{path:'改名.md'})).commits.length,2);
 await f.run(['switch','--detach']);await f.run(['commit','--allow-empty','-m','detached-only']);assert.equal((await f.git.history(f.repo.id)).commits[0].subject,'detached-only');
});
test('commit details use first parent for merges and retain binary and Chinese filenames',async t=>{
 const f=await fixture(t);await f.run(['switch','-c','feature']);await f.save('新增.md','second\n');await f.save('binary.bin',Buffer.from([0,1,2]));await f.commit('feature');await f.run(['switch','main']);await f.save('main.txt','main');await f.commit('main');await f.run(['merge','--no-ff','-m','merge feature','feature']);
 const detail=await f.git.commit(f.repo.id,'HEAD');assert.equal(detail.parents.length,2);assert.deepEqual(detail.paths.sort(),['binary.bin','新增.md']);assert.equal(detail.author,'测试作者');assert.equal(detail.files.find(f=>f.path==='binary.bin').added,null);
 for(const path of detail.paths)assert.ok((await f.git.diff(f.repo.id,{path,rev:detail.oid})).patch);
});
test('branch create supports start point, staying in place, remote tracking, rename and safe deletion',async t=>{
 const f=await fixture(t);await f.save('说明.md','second\n');await f.commit('second');await f.must('branch-create',{name:'from-first',startPoint:f.first,checkout:false});assert.equal((await f.git.status(f.repo.id)).branch.name,'main');assert.equal((await f.run(['rev-parse','from-first'])).stdout.trim(),f.first);
 await f.must('branch-rename',{name:'from-first',newName:'renamed'});await f.must('branch-delete',{name:'renamed'});
 const bare=join(f.root,'remote.git');await runGit(f.root,['init','--bare',bare]);await f.run(['remote','add','origin',bare]);await f.run(['push','origin','main:remote-task']);await f.run(['fetch','origin']);await f.must('branch-track',{source:'refs/remotes/origin/remote-task',name:'local-task'});assert.equal((await f.git.status(f.repo.id)).branch.upstream,'origin/remote-task');
 const refs=await f.git.refs(f.repo.id);assert.ok(refs.branches.some(b=>b.fullName==='refs/remotes/origin/remote-task'));assert.equal((await f.op('branch-track',{source:'refs/heads/main',name:'invalid'})).status,'failed');
});
test('push can establish the requested upstream, and does not report push as a fetch',async t=>{
 const f=await fixture(t),bare=join(f.root,'remote.git');await runGit(f.root,['init','--bare',bare]);await f.run(['remote','add','origin',bare]);await f.must('push',{remote:'origin',branch:'review-target',setUpstream:true});let state=await f.git.status(f.repo.id);assert.equal(state.branch.upstream,'origin/review-target');assert.equal(state.lastFetchedAt,null);await f.must('fetch',{remote:'origin'});state=await f.git.status(f.repo.id);assert.ok(state.lastFetchedAt);assert.equal((await f.op('push',{remote:'origin',branch:'bad:name'})).status,'failed');
});
test('stash removes Chinese and literal-looking untracked files, previews them and restores index on request',async t=>{
 const f=await fixture(t);await f.save('说明.md','staged\n');await f.run(['add','--','说明.md']);await f.save('中文 文件.md','draft\n');await f.save(platform.name==='win32'?'[literal].txt':':(glob)*.txt','literal\n');await f.must('stash-create',{message:'draft',includeUntracked:true});assert.equal((await f.git.status(f.repo.id)).changedCount,0);
 const stash=(await f.git.refs(f.repo.id)).stashes[0],detail=await f.git.stashDetail(f.repo.id,stash.oid);assert.equal(detail.files.length,3);const file=detail.files.find(f=>f.path==='中文 文件.md');assert.equal(file.untracked,true);assert.equal((await f.git.diff(f.repo.id,{path:file.path,rev:file.rev})).after,'draft\n');
 await f.must('stash-apply',{stash:stash.ref,stashOid:stash.oid,restoreIndex:true});assert.equal((await f.git.status(f.repo.id)).entries.find(e=>e.path==='说明.md').index,'M');assert.equal(await readFile(join(f.path,platform.name==='win32'?'[literal].txt':':(glob)*.txt'),'utf8'),'literal\n');assert.equal((await f.git.refs(f.repo.id)).stashes.length,1);
});
test('unstaging a rename includes the original path and preserves worktree contents',async t=>{
 const f=await fixture(t);await f.run(['mv','说明.md','改名.md']);const diff=await f.git.diff(f.repo.id,{path:'改名.md',staged:true});assert.equal(diff.before,'first\n');await f.must('unstage',{paths:['改名.md']});const state=await f.git.status(f.repo.id);assert.ok(state.entries.every(e=>e.index==='.'||e.index==='?'));assert.equal(await readFile(join(f.path,'改名.md'),'utf8'),'first\n');
});
test('conflict resolution handles delete/modify, missing result files and stale references',async t=>{
 const f=await fixture(t);await f.run(['switch','-c','delete']);await f.run(['rm','--','说明.md']);await f.run(['commit','-m','delete']);await f.run(['switch','main']);await f.save('说明.md','changed\n');await f.commit('modify');await runGit(f.path,['merge','delete'],{allowFailure:true});
 let conflict=await f.git.conflict(f.repo.id,'说明.md');assert.equal(conflict.oursExists,true);assert.equal(conflict.theirsExists,false);await f.must('resolve',{path:'说明.md',remove:true,fileVersion:conflict.fileVersion});assert.equal((await f.git.status(f.repo.id)).conflictCount,0);await assert.rejects(readFile(join(f.path,'说明.md')));
 await f.must('merge-abort');await runGit(f.path,['merge','delete'],{allowFailure:true});await rm(join(f.path,'说明.md'));conflict=await f.git.conflict(f.repo.id,'说明.md');assert.equal(conflict.fileVersion,'missing');await f.must('resolve',{path:'说明.md',text:'recreated\n',fileVersion:'missing'});assert.equal(await readFile(join(f.path,'说明.md'),'utf8'),'recreated\n');await f.must('merge-abort');
 await f.run(['branch','other']);const expected=(await f.run(['rev-parse','other'])).stdout.trim();await f.run(['branch','-f','other',f.first]);assert.equal((await f.op('branch-delete',{name:'other',expectedOid:expected})).error.code,'GIT_REF_CHANGED');assert.ok((await f.git.refs(f.repo.id)).branches.some(b=>b.name==='other'));
});

test('HEAD history on an unborn branch is an empty history even when other branches have commits',async t=>{
 const f=await fixture(t);await f.run(['switch','--orphan','fresh']);assert.equal((await f.git.status(f.repo.id)).branch.oid,null);const empty=await f.git.history(f.repo.id,{rev:'HEAD'});assert.deepEqual(empty.commits,[]);assert.equal(empty.nextOffset,null);assert.equal(empty.offset,0);assert.ok((await f.git.history(f.repo.id)).commits.length>0);
});
