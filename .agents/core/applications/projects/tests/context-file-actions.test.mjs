import test from 'node:test';
import assert from 'node:assert/strict';
import {createContextFileActions,renameTarget,moveTarget} from '../context-file-actions.js';

const source={path:'项目/示例/资料/原件.md',ref:{scope:'workspace',path:'项目/示例/资料/原件.md'},kind:'file',version:'fixed-source-version',writable:true};
function fixture(overrides={}){
 const calls=[],changes=[];let sequence=0;
 const files={stat:async ref=>{calls.push(['stat',ref]);return structuredClone(source);},move:async input=>{calls.push(['move',input]);return {path:input.destination.path,kind:'file'};},trash:async input=>{calls.push(['trash',input]);return {id:'trash-entry',ref:input.ref};},restore:async input=>{calls.push(['restore',input]);return source;},...overrides};
 const actions=createContextFileActions({files,before:async()=>{calls.push(['prepare']);return true;},changed:async(...args)=>changes.push(args),id:()=>`operation-${++sequence}`});
 return {actions,calls,changes,files};
}
test('rename only accepts a basename; move retains the name and excludes the source subtree',()=>{
 assert.equal(renameTarget(source.path,'  新名称.md '),'项目/示例/资料/新名称.md');
 for(const name of ['','..','a/b.md','a\\b.md','bad\0.md'])assert.throws(()=>renameTarget(source.path,name));
 assert.equal(moveTarget(source,'项目/示例/成果','项目/示例'),'项目/示例/成果/原件.md');
 for(const folder of ['项目/其他','项目/示例/../其他','项目/示例//子级'])assert.throws(()=>moveTarget(source,folder,'项目/示例'));
 const dir={path:'项目/示例/资料',kind:'directory'};
 for(const folder of [dir.path,dir.path+'/子级'])assert.throws(()=>moveTarget(dir,folder,'项目/示例'));
});
test('opening and confirming save first, then use the displayed source version and receipt id',async()=>{
 const {actions,calls,changes}=fixture();await actions.begin('rename',source.path);
 assert.deepEqual(calls.map(x=>x[0]),['prepare','stat']);
 await actions.commit(renameTarget(source.path,'新名称.md'));
 assert.deepEqual(calls.map(x=>x[0]),['prepare','stat','prepare','move']);
 assert.equal(calls[3][1].version,source.version);assert.equal(calls[3][1].operationId,'operation-1');
 assert.equal(changes.length,1);assert.equal(actions.getSnapshot().dialog,null);assert.equal(actions.blocked(),false);
});
test('same location and protected files never dispatch mutations',async()=>{
 const f=fixture();await f.actions.begin('move',source.path);await f.actions.commit(source.path);
 assert.equal(f.calls.some(x=>x[0]==='move'),false);assert.match(f.actions.getSnapshot().error,/已在此文件夹/);
 const p=fixture({stat:async()=>({...source,writable:false,protection:{message:'已登记证据'}})});
 await p.actions.begin('delete',source.path);assert.equal(p.actions.getSnapshot().dialog,null);assert.match(p.actions.getSnapshot().error,/已登记证据/);
});
test('delete is confirmed separately and undo restores the exact trash entry',async()=>{
 const {actions,calls}=fixture();await actions.begin('delete',source.path);
 assert.equal(calls.some(x=>x[0]==='trash'),false);await actions.commit();
 assert.equal(actions.getSnapshot().deleted.id,'trash-entry');await actions.undo();
 assert.deepEqual(calls.find(x=>x[0]==='restore')[1],{trashId:'trash-entry',operationId:'operation-2'});
 assert.equal(actions.getSnapshot().deleted,null);
});
test('a lost reply blocks close and further actions, and reconciles without replay',async()=>{
 let writes=0;const f=fixture({move:async input=>{writes++;throw Object.assign(Error('network lost'),{operationId:input.operationId});},operation:async()=>({state:'committed',result:{path:'项目/示例/成果/原件.md'}})});
 await f.actions.begin('move',source.path);await f.actions.commit('项目/示例/成果/原件.md');
 assert.equal(f.actions.blocked(),true);assert.equal(f.actions.close(),false);
 await f.actions.begin('delete',source.path);await f.actions.commit('项目/示例/其他/原件.md');assert.equal(writes,1);
 await f.actions.reconcile();assert.equal(f.actions.blocked(),false);assert.equal(f.changes.length,1);assert.equal(writes,1);
});
test('conflict and duplicate destination retain the dialog without replacing content',async()=>{
 for(const code of ['WORKSPACE_CONFLICT','WORKSPACE_EXISTS','PROJECT_CONTEXT_REFERENCED']){
  const f=fixture({move:async()=>{throw Object.assign(Error(code),{code});}});
  await f.actions.begin('rename',source.path);await f.actions.commit('项目/示例/资料/新名称.md');
  assert.equal(f.actions.blocked(),false);assert.equal(f.actions.getSnapshot().dialog.source.version,source.version);assert.equal(f.changes.length,0);
 }
});
test('refused preparation and disposal during preparation cannot dispatch a write',async()=>{
 let writes=0,finish;const actions=createContextFileActions({files:{stat:async()=>source,trash:async()=>{writes++;}},before:()=>new Promise(resolve=>finish=resolve),changed:async()=>{}});
 const opening=actions.begin('delete',source.path);finish(false);await opening;assert.equal(actions.getSnapshot().dialog,null);
 const next=actions.begin('delete',source.path);actions.dispose();finish(true);await next;assert.equal(writes,0);assert.equal(actions.getSnapshot().dialog,null);
});
test('successful mutation is never repeated when refreshing the view fails',async()=>{
 let writes=0;const actions=createContextFileActions({files:{stat:async()=>source,move:async()=>{writes++;return {path:'项目/示例/资料/新.md'};}},before:async()=>true,changed:async()=>{throw Error('offline refresh');},id:()=> 'operation-refresh'});
 await actions.begin('rename',source.path);await actions.commit('项目/示例/资料/新.md');
 assert.equal(writes,1);assert.equal(actions.getSnapshot().dialog,null);assert.equal(actions.getSnapshot().unknown,null);assert.match(actions.getSnapshot().error,/操作已完成/);
});
test('a refused host resource preparation creates no unknown operation to reconcile',async()=>{
 const f=fixture({move:async()=>{throw Error('另一个窗口还有草稿。');}});
 await f.actions.begin('move',source.path);await f.actions.commit('项目/示例/成果/原件.md');
 assert.equal(f.actions.getSnapshot().unknown,null);assert.equal(f.actions.blocked(),false);assert.equal(f.actions.close(),true);assert.equal(f.changes.length,0);
});
