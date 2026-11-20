import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {createFileService,MAX_FILE_BYTES} from '../src/services/files.js';
import {createWorkspaceFiles} from '../src/services/workspace-files.js';
import {createCoordinator,digest} from '../src/services/workbench-common.js';
const who={appId:'com.example.files',dataStores:[{name:'state.json',scope:'user',schemaVersion:1,migrateFrom:[]}]};
const ref=(path,scope='workspace')=>({scope,path});
async function fixture(t,options={}){const root=await mkdtemp(join(tmpdir(),'ksf-files-'));await mkdir(join(root,'项目'));const coordinator=createCoordinator(),workspace=createWorkspaceFiles(root,coordinator),files=createFileService(root,{workspace,coordinator,...options});t.after(async()=>{await files.close();await rm(root,{recursive:true,force:true});});return {root,files,workspace,coordinator};}
test('binary and text round trips preserve bytes, require a version, and bind app scopes',async t=>{
 const {files}=await fixture(t);const bytes=Buffer.from([0,255,1,2,3]);await files.write(who,{ref:ref('项目/a.bin'),bytes});const original=await files.stat(who,ref('项目/a.bin'));await files.copy(who,{ref:original.ref,destination:ref('first.bin','runtime'),version:original.version});assert.deepEqual((await files.read(who,ref('first.bin','runtime'))).bytes,bytes);assert.deepEqual((await files.read(who,ref('项目/a.bin'))).bytes,bytes);
 await assert.rejects(files.write(who,{ref:ref('项目/a.bin'),bytes}),{code:'WORKSPACE_CONFLICT'});const before=await files.stat(who,ref('项目/a.bin'));await files.write(who,{ref:before.ref,bytes:Buffer.from('new'),ifMatch:before.version});await assert.rejects(files.write(who,{ref:before.ref,bytes,ifMatch:before.version}),{code:'WORKSPACE_CONFLICT'});
 await files.mkdir(who,{ref:ref('nested/deep','user'),recursive:true});await files.writeText(who,{ref:ref('nested/deep/note.txt','user'),text:'\ufeff中文\r\n'});assert.equal((await files.readText(who,ref('nested/deep/note.txt','user'))).text,'\ufeff中文\r\n');assert.equal(await files.exists({appId:'com.example.other'},ref('nested/deep/note.txt','user')),false);
 await assert.rejects(files.write(who,{ref:ref('state.json','user'),text:'{}'}),{code:'APP_DATA_MANAGED'});await assert.rejects(files.write(who,{ref:ref('STATE.JSON','user'),text:'{}'}),{code:'APP_DATA_MANAGED'});await assert.rejects(files.write(who,{ref:ref('note.LOCK','user'),text:'x'}),{code:'FILE_PATH_PROTECTED'});
});
test('generic file service rejects traversal, symlinks, protected paths and unauthorized overwrite',async t=>{
 const {root,files}=await fixture(t);await writeFile(join(root,'USER.md'),'private');await symlink(join(root,'USER.md'),join(root,'项目/link'));
 for(const path of ['../USER.md','/etc/passwd','项目/link','.agents/runtime-data/key','.env'])await assert.rejects(files.stat(who,ref(path)));
 await assert.rejects(files.mkdir(who,{ref:ref('.agents/new'),recursive:true}),{code:'WORKSPACE_READONLY'});
 await assert.rejects(files.trash(who,{ref:ref(''),version:'x'}),{code:'FILE_ROOT_PROTECTED'});
});
test('copy and move handle binary files and directories without exposing partial targets',async t=>{
 const {root,files}=await fixture(t);await files.mkdir(who,{ref:ref('项目/原件')});await files.write(who,{ref:ref('项目/原件/附件.bin'),bytes:Buffer.from([0,255])});let source=await files.stat(who,ref('项目/原件'));
 // Directory mutations use the recursive source version returned by stat.
 await files.copy(who,{ref:source.ref,destination:ref('项目/副本'),version:source.version});assert.deepEqual(await readFile(join(root,'项目/副本/附件.bin')),Buffer.from([0,255]));
 source=await files.stat(who,ref('项目/副本/附件.bin'));await files.move(who,{ref:source.ref,destination:ref('项目/中文 空格.bin'),version:source.version});assert.equal(await files.exists(who,source.ref),false);
 await assert.rejects(files.copy(who,{ref:ref('项目/原件'),destination:ref('项目/原件/内部'),version:'x'}));
});
test('trash survives service restart, restores exclusively, and permanent removal is explicit',async t=>{
 const f=await fixture(t);await f.files.write(who,{ref:ref('项目/a.pdf'),bytes:Buffer.from([0,1,2])});const before=await f.files.stat(who,ref('项目/a.pdf'));const entry=await f.files.trash(who,{ref:before.ref,version:before.version});assert.equal(await f.files.exists(who,before.ref),false);await f.files.close();
 const files=createFileService(f.root,{workspace:f.workspace,coordinator:f.coordinator});t.after(()=>files.close());assert.equal((await files.listTrash(who))[0].id,entry.id);
 await files.write(who,{ref:before.ref,text:'occupied'});await assert.rejects(files.restore(who,{trashId:entry.id}),{code:'WORKSPACE_EXISTS'});await files.restore(who,{trashId:entry.id,destination:ref('项目/restored/a.pdf')});assert.deepEqual((await files.read(who,ref('项目/restored/a.pdf'))).bytes,Buffer.from([0,1,2]));
 const again=await files.trash(who,{ref:before.ref,version:(await files.stat(who,before.ref)).version});await assert.rejects(files.purge(who,{trashId:again.id}),{code:'FILE_CONFIRM_REQUIRED'});await files.purge(who,{trashId:again.id,confirm:true});assert.equal((await files.listTrash(who)).some(x=>x.id===again.id),false);
});
test('operation ids reconcile committed writes and reject changed payload reuse',async t=>{
 const {files}=await fixture(t);const input={ref:ref('项目/id.bin'),bytes:Buffer.from('one'),operationId:'operation_replay'};const first=await files.write(who,input);assert.deepEqual(await files.write(who,input),first);assert.equal((await files.operation(who,input.operationId)).state,'committed');await assert.rejects(files.write(who,{...input,bytes:Buffer.from('two')}),{code:'FILE_OPERATION_CONFLICT'});
});
test('failed publication preserves original and does not expose a partial new file',async t=>{
 const {files}=await fixture(t,{fault:phase=>{if(phase==='before-publish')throw Object.assign(Error('disk full'),{code:'ENOSPC'});}});await assert.rejects(files.write(who,{ref:ref('项目/new.bin'),bytes:Buffer.from('candidate')}),{code:'ENOSPC'});assert.equal(await files.exists(who,ref('项目/new.bin')),false);
});
test('raw upload enforces digest and bounded streaming without buffering the whole request',async t=>{
 const {files}=await fixture(t);const data=Buffer.from([0,255,3]);await files.write(who,{ref:ref('项目/upload.bin'),contentDigest:digest(data)},Readable.from([data]));assert.deepEqual((await files.read(who,ref('项目/upload.bin'))).bytes,data);
 const chunk=Buffer.alloc(1024*1024);async function* huge(){for(let n=0;n<=MAX_FILE_BYTES/chunk.length;n++)yield chunk;}await assert.rejects(files.write(who,{ref:ref('项目/huge.bin'),contentDigest:'a'.repeat(64)},Readable.from(huge())),{code:'FILE_TOO_LARGE'});assert.equal(await files.exists(who,ref('项目/huge.bin')),false);
});
test('watch detects external edits and invalid cursors request resynchronization',async t=>{
 const {root,files}=await fixture(t);const input={ref:ref('项目'),waitMs:0,subscriptionId:'watch_probe'};const initial=await files.changes(who,input);assert.equal(initial.resync,true);await writeFile(join(root,'项目/external.txt'),'external');await new Promise(r=>setTimeout(r,100));const next=await files.changes(who,{...input,cursor:initial.cursor,waitMs:1500});assert.ok(next.events.some(e=>e.ref.path==='项目/external.txt'));await files.unwatch(who,{subscriptionId:input.subscriptionId});await files.mkdir(who,{ref:ref('项目/watch-dir')});await files.writeText(who,{ref:ref('项目/watch-dir/note.md'),text:'watch'});const childWatch={ref:ref('项目/watch-dir/note.md'),waitMs:0,subscriptionId:'watch_nested_file'},first=await files.changes(who,childWatch),dir=await files.stat(who,ref('项目/watch-dir'));await files.move(who,{ref:dir.ref,version:dir.version,destination:ref('项目/watch-moved')});const moved=await files.changes(who,{...childWatch,cursor:first.cursor});assert.ok(moved.events.some(e=>e.type==='move'&&e.previousRef.path==='项目/watch-dir'));await files.unwatch(who,{subscriptionId:childWatch.subscriptionId});
});
test('list and stat expose the same directory version, with protected entries marked read-only',async t=>{
 const {files}=await fixture(t);await files.mkdir(who,{ref:ref('项目/目录')});await files.mkdir(who,{ref:ref('项目/目录/子目录')});await files.writeText(who,{ref:ref('项目/目录/子目录/文档.txt'),text:'one'});const listing=await files.list(who,ref('项目'));assert.equal(listing.version,(await files.stat(who,ref('项目'))).version);const listed=listing.entries.find(x=>x.path==='项目/目录');assert.equal(listed.version,(await files.stat(who,listed.ref)).version);await files.copy(who,{ref:listed.ref,version:listed.version,destination:ref('项目/目录副本')});
 assert.equal((await files.stat(who,ref('state.json','user')).catch(()=>null)),null);await files.mkdir(who,{ref:ref('data','runtime')});
});
test('published writes and restores reconcile after lost receipts without replaying mutations',async t=>{
 let phase;const {files}=await fixture(t,{fault:current=>{if(current===phase)throw Object.assign(Error('process interrupted'),{code:'TEST_INTERRUPT'});}});
 const write={ref:ref('项目/interrupted.bin'),bytes:Buffer.from('complete'),operationId:'interrupted_write'};phase='after-publish';await assert.rejects(files.write(who,write),{code:'TEST_INTERRUPT'});assert.equal((await files.operation(who,write.operationId)).state,'committed');await files.write(who,write);
 phase=undefined;const source=await files.stat(who,write.ref),entry=await files.trash(who,{ref:source.ref,version:source.version});phase='after-restore';const restore={trashId:entry.id,operationId:'interrupted_restore'};await assert.rejects(files.restore(who,restore),{code:'TEST_INTERRUPT'});assert.equal((await files.operation(who,restore.operationId)).state,'committed');await files.restore(who,restore);assert.equal((await files.readText(who,write.ref)).text,'complete');
});
test('exactly 128 MiB streams successfully; aborted uploads leave no target or temporary file',async t=>{
 const {root,files}=await fixture(t);const chunk=Buffer.alloc(1024*1024,83);const {createHash}=await import('node:crypto');const hash=createHash('sha256');for(let i=0;i<128;i++)hash.update(chunk);const expected=hash.digest('hex');
 async function* data(){for(let i=0;i<128;i++)yield chunk;}await files.write(who,{ref:ref('项目/boundary.bin'),contentDigest:expected},Readable.from(data()));const value=await files.openRead(who,ref('项目/boundary.bin')),actual=createHash('sha256');try{for await(const part of value.handle.createReadStream({autoClose:false}))actual.update(part);await value.verify();}finally{await value.handle.close();}assert.equal(actual.digest('hex'),expected);
 async function* cancelled(){yield chunk;throw Object.assign(Error('cancelled'),{code:'ABORT_ERR'});}await assert.rejects(files.write(who,{ref:ref('项目/cancelled.bin'),contentDigest:expected},Readable.from(cancelled())),{code:'ABORT_ERR'});assert.equal(await files.exists(who,ref('项目/cancelled.bin')),false);const {readdir}=await import('node:fs/promises');assert.ok((await readdir(join(root,'项目'))).every(x=>!x.startsWith('.ksf-file-')));
});
test('two apps and external writers cannot silently replace an observed file',async t=>{
 const {files,root}=await fixture(t);const refA=ref('项目/shared.txt');await files.writeText(who,{ref:refA,text:'initial'});const first=await files.stat(who,refA);const results=await Promise.allSettled([files.writeText(who,{ref:refA,text:'left',ifMatch:first.version}),files.writeText({appId:'com.example.other'},{ref:refA,text:'right',ifMatch:first.version})]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'WORKSPACE_CONFLICT');
 const stale=await files.stat(who,refA);await writeFile(join(root,refA.path),'external');await assert.rejects(files.writeText(who,{ref:refA,text:'stale',ifMatch:stale.version}),{code:'WORKSPACE_CONFLICT'});assert.equal((await files.readText(who,refA)).text,'external');
});
test('a real process interruption retains staging evidence and reconciles an already published file after restart',async t=>{
 const {root,files}=await fixture(t);const {spawnSync}=await import('node:child_process');const serviceURL=new URL('../src/services/files.js',import.meta.url).href;
 for(const phase of ['before-publish','after-publish']){
  const id='killed_'+phase.replaceAll('-','_'),path='项目/'+id+'.bin';
  const script=`import {createFileService} from ${JSON.stringify(serviceURL)};const files=createFileService(${JSON.stringify(root)},{fault:phase=>{if(phase===${JSON.stringify(phase)})process.kill(process.pid,'SIGKILL');}});await files.write({appId:'com.example.files'},{ref:{scope:'workspace',path:${JSON.stringify(path)}},bytes:Buffer.from('restart-content'),operationId:${JSON.stringify(id)}});`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8'});assert.equal(result.error,undefined);assert.ok(result.signal==='SIGKILL'||process.platform==='win32'&&result.status!==0);const receipt=await files.operation(who,id);
  if(phase==='before-publish'){assert.equal(receipt.state,'prepared');assert.equal(await files.exists(who,ref(path)),false);assert.equal((await readFile(join(root,receipt.candidate.temporary))).toString(),'restart-content');}
  else{assert.equal(receipt.state,'committed');assert.equal((await files.readText(who,ref(path))).text,'restart-content');}
 }
});
test('app-owned directory versions include nested files even in common build folders',async t=>{
 const {files}=await fixture(t);await files.mkdir(who,{ref:ref('exports/dist','user'),recursive:true});await files.writeText(who,{ref:ref('exports/dist/a.txt','user'),text:'initial'});const before=await files.stat(who,ref('exports','user')),content=await files.stat(who,ref('exports/dist/a.txt','user'));await files.writeText(who,{ref:content.ref,text:'changed',ifMatch:content.version});assert.notEqual((await files.stat(who,before.ref)).version,before.version);await assert.rejects(files.trash(who,{ref:before.ref,version:before.version}),{code:'WORKSPACE_CONFLICT'});
});
test('legacy storage and generic app files share path locks without nesting the repository lock',async t=>{
 const {root,files,coordinator}=await fixture(t);const {createApplicationStorage}=await import('../src/services/application-storage.js'),storage=createApplicationStorage(root,{locks:coordinator});
 let timer;try{await Promise.race([coordinator.run(root,()=>storage.write(who,'note.txt','initial',{ifMatch:null})),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('repository/storage lock deadlock')),1500);})]);}finally{clearTimeout(timer);}
 const before=await files.stat(who,ref('note.txt','user')),old=await storage.read(who,'note.txt');const values=await Promise.allSettled([files.writeText(who,{ref:before.ref,text:'generic',ifMatch:before.version}),storage.write(who,'note.txt','legacy',{ifMatch:old.etag})]);assert.equal(values.filter(v=>v.status==='fulfilled').length,1);assert.ok(['WORKSPACE_CONFLICT','APP_DATA_CONFLICT'].includes(values.find(v=>v.status==='rejected').reason.code));
});
test('two apps reusing the same operation id cannot replace each other’s workspace trash payload',async t=>{
 const {files}=await fixture(t),other={appId:'com.example.other'};const entries=[];
 for(const [caller,name,text] of [[who,'one','first'],[other,'two','second']]){const file=await files.writeText(caller,{ref:ref('项目/'+name+'.txt'),text});entries.push(await files.trash(caller,{ref:file.ref,version:file.version,operationId:'shared_operation_id'}));}
 assert.notEqual(entries[0].id,entries[1].id);assert.equal((await files.listTrash(who)).length,2);for(const entry of entries)await files.restore(who,{trashId:entry.id});assert.equal((await files.readText(who,ref('项目/one.txt'))).text,'first');assert.equal((await files.readText(who,ref('项目/two.txt'))).text,'second');
});
