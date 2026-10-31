import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCoordinator } from '../src/services/workbench-common.js';
import { createWorkspaceFiles } from '../src/services/workspace-files.js';
import { createWorkbenchGit, runGit } from '../src/services/workbench-git.js';
async function fixture(t) {
 const root=await realpath(await mkdtemp(join(tmpdir(),'ksf-git-settings-'))),path=join(root,'repositories/demo');await mkdir(path,{recursive:true});
 const run=args=>runGit(path,args);await run(['init','-b','main']);await run(['config','user.name','Fixture']);await run(['config','user.email','fixture@example.invalid']);await run(['config','commit.gpgsign','false']);
 const coordinator=createCoordinator(),git=createWorkbenchGit(root,createWorkspaceFiles(root,coordinator),coordinator);t.after(async()=>{await git.close();await rm(root,{recursive:true,force:true});});
 await git.scan();const repo=(await git.list()).repositories.find(repo=>repo.path==='repositories/demo');
 const op=async(action,input={},version)=>{const settings=await git.settings(repo.id),item=await git.start({repo:repo.id,action,settingsVersion:version??settings.settingsVersion,requestId:crypto.randomUUID(),...input});while(['queued','running'].includes(item.status))await new Promise(resolve=>setTimeout(resolve,5));return item;};
 const must=async(action,input,version)=>{const item=await op(action,input,version);assert.equal(item.status,'completed',JSON.stringify(item.error));return item;};
 return {root,path,run,git,repo,op,must};
}
test('identity edits and inheritance use independent config versions and preserve unrelated values',async t=>{
 const f=await fixture(t),before=await f.git.settings(f.repo.id);assert.equal(before.identity.name.value,'Fixture');assert.equal(before.identity.name.source,'local');assert.equal(before.identity.email.ownValue,'fixture@example.invalid');
 await writeFile(join(f.path,'ordinary.txt'),'a worktree change');assert.equal((await f.git.settings(f.repo.id)).settingsVersion,before.settingsVersion);
 await f.must('config-set',{field:'name',value:'New Name'},before.settingsVersion);let settings=await f.git.settings(f.repo.id);assert.equal(settings.identity.name.value,'New Name');assert.equal(settings.identity.email.ownValue,'fixture@example.invalid');
 assert.equal((await f.op('config-set',{field:'email',value:'stale@example.invalid'},before.settingsVersion)).error.code,'GIT_SETTINGS_CHANGED');
 const inherited=await f.run(['config','--global','--get','user.name']).catch(()=>({stdout:''}));await f.must('config-unset',{field:'name'});settings=await f.git.settings(f.repo.id);assert.equal(settings.identity.name.ownValue,null);assert.equal(settings.identity.name.value,inherited.stdout.trim());
 assert.equal((await f.op('config-set',{field:'core.hooksPath',value:'/tmp/x'})).error.code,'GIT_CONFIG_FIELD_INVALID');
});
test('remote editing preserves multiple fetch/push URLs and redacts credentials in results',async t=>{
 const f=await fixture(t),secret='https://fixture:VERY_PRIVATE@example.invalid/repo.git?token=HIDDEN_TOKEN';
 await f.must('remote-add',{name:'origin',url:secret});await f.must('remote-url-add',{name:'origin',kind:'fetch',url:'ssh://git@example.invalid/second.git'});await f.must('remote-url-add',{name:'origin',kind:'push',url:'https://example.invalid/push-one.git'});await f.must('remote-url-add',{name:'origin',kind:'push',url:'https://example.invalid/push-two.git'});
 let settings=await f.git.settings(f.repo.id),remote=settings.remotes[0];assert.equal(remote.urls.length,2);assert.equal(remote.pushUrls.length,2);assert.equal(remote.urls[0].redacted,true);assert.ok(!JSON.stringify(settings).includes('VERY_PRIVATE'));assert.ok(!JSON.stringify(settings).includes('HIDDEN_TOKEN'));
 await f.must('config-set',{field:'name',value:'Another Name'});assert.equal((await f.run(['config','--get-all','remote.origin.url'])).stdout.split('\n')[0],secret);
 await f.must('remote-set-url',{name:'origin',kind:'fetch',urlId:remote.urls[1].id,url:'https://example.invalid/changed.git'});assert.deepEqual((await f.run(['config','--get-all','remote.origin.url'])).stdout.trimEnd().split('\n'),[secret,'https://example.invalid/changed.git']);
 settings=await f.git.settings(f.repo.id);remote=settings.remotes[0];await f.must('remote-url-remove',{name:'origin',kind:'push',urlId:remote.pushUrls[0].id});settings=await f.git.settings(f.repo.id);assert.equal(settings.remotes[0].pushUrls.length,1);
 await f.must('remote-url-remove',{name:'origin',kind:'push',urlId:settings.remotes[0].pushUrls[0].id});assert.equal((await f.git.settings(f.repo.id)).remotes[0].pushUrls.length,0);
 await f.must('remote-rename',{name:'origin',newName:'upstream'});settings=await f.git.settings(f.repo.id);assert.equal(settings.remotes[0].name,'upstream');assert.equal(settings.remotes[0].urls.length,2);
 await f.must('remote-remove',{name:'upstream'});assert.deepEqual((await f.git.settings(f.repo.id)).remotes,[]);
});
test('external changes and config lock failures do not overwrite configuration, request retries are deduplicated',async t=>{
 const f=await fixture(t),initial=await f.git.settings(f.repo.id);await f.run(['config','user.email','external@example.invalid']);assert.equal((await f.op('config-set',{field:'name',value:'stale'},initial.settingsVersion)).error.code,'GIT_SETTINGS_CHANGED');
 const current=await f.git.settings(f.repo.id),request={repo:f.repo.id,action:'config-set',field:'name',value:'Once',settingsVersion:current.settingsVersion,requestId:crypto.randomUUID()};const first=await f.git.start(request),second=await f.git.start(request);assert.equal(first.id,second.id);while(['queued','running'].includes(first.status))await new Promise(resolve=>setTimeout(resolve,5));assert.equal(first.status,'completed');
 await writeFile(join(f.path,'.git/config.lock'),'fixture lock');assert.equal((await f.op('config-set',{field:'name',value:'blocked'})).status,'failed');assert.equal((await f.git.settings(f.repo.id)).identity.name.value,'Once');assert.equal(await readFile(join(f.path,'.git/config.lock'),'utf8'),'fixture lock');
});
test('existing worktree configuration writes identity to the selected worktree only',async t=>{
 const f=await fixture(t);await f.run(['commit','--allow-empty','-m','initial']);await f.run(['config','extensions.worktreeConfig','true']);
 const tree=join(f.root,'repositories/linked');await f.run(['worktree','add','-b','linked',tree]);await f.git.scan(true);const repo=(await f.git.list()).repositories.find(repo=>repo.path==='repositories/linked');assert.ok(repo);
 const initial=await f.git.settings(repo.id);assert.equal(initial.scope,'worktree');assert.equal(initial.identity.name.ownValue,null);
 const operation=await f.git.start({repo:repo.id,action:'config-set',field:'name',value:'Linked Only',settingsVersion:initial.settingsVersion,requestId:crypto.randomUUID()});while(['queued','running'].includes(operation.status))await new Promise(resolve=>setTimeout(resolve,5));assert.equal(operation.status,'completed',JSON.stringify(operation.error));
 assert.equal((await f.git.settings(repo.id)).identity.name.value,'Linked Only');assert.equal((await f.git.settings(f.repo.id)).identity.name.value,'Fixture');assert.equal((await f.run(['config','--local','user.name'])).stdout.trim(),'Fixture');
});
test('remote validation, stale address identities and last fetch URL are protected',async t=>{
 const f=await fixture(t);assert.equal((await f.op('remote-add',{name:'--bad',url:'https://example.invalid/a'})).status,'failed');assert.equal((await f.op('remote-add',{name:'safe',url:'ext::sh payload'})).error.code,'GIT_REMOTE_URL_INVALID');
 await f.must('remote-add',{name:'origin',url:'https://example.invalid/a'});let settings=await f.git.settings(f.repo.id);assert.equal((await f.op('remote-url-remove',{name:'origin',kind:'fetch',urlId:settings.remotes[0].urls[0].id})).error.code,'GIT_REMOTE_URL_REQUIRED');
 assert.equal((await f.op('remote-set-url',{name:'origin',kind:'fetch',urlId:'missing',url:'https://example.invalid/b'})).error.code,'GIT_REMOTE_URL_CHANGED');
 await f.run(['config','--add','remote.origin.url','https://example.invalid/a']);settings=await f.git.settings(f.repo.id);await f.must('remote-set-url',{name:'origin',kind:'fetch',urlId:settings.remotes[0].urls[0].id,url:'https://example.invalid/b'});assert.deepEqual((await f.run(['config','--get-all','remote.origin.url'])).stdout.trim().split('\n'),['https://example.invalid/b','https://example.invalid/a']);
});

test('configuration writes share the operation queue and reject the second concurrent stale form',async t=>{
 const f=await fixture(t),settings=await f.git.settings(f.repo.id),version=settings.settingsVersion;
 const requests=['First','Second'].map(value=>({repo:f.repo.id,action:'config-set',field:'name',value,settingsVersion:version,requestId:crypto.randomUUID()}));
 const operations=await Promise.all(requests.map(request=>f.git.start(request)));for(const operation of operations)while(['queued','running'].includes(operation.status))await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(operations.filter(operation=>operation.status==='completed').length,1);assert.equal(operations.find(operation=>operation.status==='failed').error.code,'GIT_SETTINGS_CHANGED');const winner=operations.findIndex(operation=>operation.status==='completed');assert.equal((await f.git.settings(f.repo.id)).identity.name.value,requests[winner].value);
});
test('settings HTTP contract stays read-only and configuration operations require the existing session protection',async t=>{
  let server;
  t.after(() => server?.close());

 const {startWebServer}=await import('../src/services/web.js'),{createWorkbenchClient}=await import('../web/src/apps/request-client.ts');
 const f=await fixture(t);server=await startWebServer({root:f.root,port:0,capture:false});const origin=server.url.slice(0,-1);
 const client=createWorkbenchClient((url,options)=>fetch(new URL(url,origin),{...options,headers:{...options.headers,Origin:origin,'Sec-Fetch-Site':'same-origin'}}));
 const endpoint=`/api/git/repositories/${f.repo.id}/settings`,settings=await client.request(endpoint);assert.equal(settings.identity.name.value,'Fixture');assert.match(settings.settingsVersion,/^[a-f0-9]{64}$/);
 const request={repo:f.repo.id,action:'config-set',field:'name',value:'HTTP Fixture',settingsVersion:settings.settingsVersion,requestId:crypto.randomUUID()};
 const denied=await fetch(origin+'/api/git/operations',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(request)});assert.equal(denied.status,403);
 await writeFile(join(f.path,'ordinary.txt'),'does not invalidate config forms');const started=await client.request('/api/git/operations',request);let operation;do{operation=await client.request('/api/git/operations/'+started.id);if(['queued','running'].includes(operation.status))await new Promise(resolve=>setTimeout(resolve,5));}while(['queued','running'].includes(operation.status));assert.equal(operation.status,'completed',JSON.stringify(operation.error));assert.equal((await client.request(endpoint)).identity.name.value,'HTTP Fixture');
 await assert.rejects(client.request(endpoint,{}),error=>error.code==='WEB_METHOD_NOT_ALLOWED');
});

test('simultaneous retries of one request create one queued operation',async t=>{
 const f=await fixture(t),settings=await f.git.settings(f.repo.id),request={repo:f.repo.id,action:'config-set',field:'name',value:'Exactly Once',settingsVersion:settings.settingsVersion,requestId:crypto.randomUUID()};
 const operations=await Promise.all(Array.from({length:8},()=>f.git.start(request)));assert.equal(new Set(operations.map(operation=>operation.id)).size,1);while(['queued','running'].includes(operations[0].status))await new Promise(resolve=>setTimeout(resolve,5));assert.equal(operations[0].status,'completed');assert.equal((await f.git.settings(f.repo.id)).identity.name.value,'Exactly Once');
});

test('rename and removal retain worktree remote overrides and refuse a held worktree config lock',async t=>{
 const f=await fixture(t);await f.run(['config','extensions.worktreeConfig','true']);await f.run(['remote','add','origin','https://example.invalid/shared']);await f.run(['config','--worktree','remote.origin.url','https://example.invalid/extra']);await f.run(['config','--worktree','remote.origin.pushurl','https://example.invalid/push']);
 await writeFile(join(f.path,'.git/config.worktree.lock'),'fixture worktree lock');assert.equal((await f.op('remote-rename',{name:'origin',newName:'upstream'})).error.code,'GIT_CONFIG_LOCKED');assert.equal((await f.git.settings(f.repo.id)).remotes[0].name,'origin');await rm(join(f.path,'.git/config.worktree.lock'));
 await f.must('remote-rename',{name:'origin',newName:'upstream'});let settings=await f.git.settings(f.repo.id);assert.equal(settings.remotes.length,1);assert.equal(settings.remotes[0].name,'upstream');assert.equal(settings.remotes[0].urls.length,2);assert.equal(settings.remotes[0].pushUrls.length,1);assert.equal((await f.run(['remote'])).stdout.trim(),'upstream');
 await f.must('remote-remove',{name:'upstream'});assert.deepEqual((await f.git.settings(f.repo.id)).remotes,[]);assert.equal((await f.run(['remote'])).stdout.trim(),'');
});
