import test from 'node:test';import assert from 'node:assert/strict';
import {workspaceTarget,workspaceProjects,workspaceReadState,workspaceDomainFacts,workspaceContext,workspaceFileReference} from '../workspace-model.js';
import {createWorkspaceSession} from '../workspace-session.js';
import {SaveController} from '../../sdk/src/controllers/save-controller.ts';
import {createSessionSaveAdapter} from '../../sdk/src/controllers/session-adapter.ts';
test('filtering preserves external selection and raw query while distinguishing archived scope',()=>{
 const projects=[{name:'alpha',scope:'current',title:'Alpha 项目'},{name:'beta',scope:'archived',description:'历史项目'}],query='  ALPHA  ',selected='archived:beta';
 assert.deepEqual(workspaceProjects(projects,{query,selected}),{entries:[projects[0]],excluded:true});assert.equal(query,'  ALPHA  ');assert.equal(selected,'archived:beta');
 assert.deepEqual(workspaceProjects(projects,{scope:'archived',selected}),{entries:[projects[1]],excluded:false});assert.deepEqual(workspaceProjects(projects,{query:'无结果',selected}).entries,[]);
});
test('restoration validates identity and does not turn a transient read error into object disappearance',()=>{
 assert.deepEqual(workspaceTarget('current:项目A'),{name:'项目A',scope:'current'});for(const key of ['current:..','current:../other','bad:name','current:','project'])assert.equal(workspaceTarget(key),null);
 assert.equal(workspaceReadState({code:'PROJECT_NOT_FOUND'}),'unavailable');assert.equal(workspaceReadState({code:'APP_PERMISSION_REQUIRED'}),'unauthorized');assert.equal(workspaceReadState({code:'APP_CALL_FAILED'}),'error');
});
test('domain summaries retain actual merged confirmation while drafts cannot inherit verified facts',()=>{
 const subject={path:'new/milestone.md',metadata:{kind:'milestone',id:'m1',status:'completed',review_ref:{id:'r1',path:'review.md'}}},review={path:'review.md',metadata:{id:'r1',status:'completed',outcome:'passed',subject:{id:'m1',path:subject.path},user_confirmation:{subject:{id:'m1',path:'old/milestone.md'},confirmed_at:'2026-11-01'}}},record={valid:true,stale:[],documents:[subject,review]};
 assert.equal(workspaceDomainFacts(subject,record).confirmation.state,'confirmed');assert.equal(workspaceDomainFacts(subject,record,{draft:true}).confirmation.state,'unavailable');assert.equal(workspaceDomainFacts(subject,{...record,stale:['m1']}).confirmation.state,'stale');
 const task={path:'task.md',metadata:{kind:'task',id:'t1',status:'completed'}};assert.equal(workspaceDomainFacts(task,record).verification.state,'passed');assert.equal(workspaceDomainFacts(task,record,{draft:true}).verification.state,'unavailable');
});
function memorySession(){
 const records=new Map();let revision=0,writeCount=0,lost=false,unavailable=false;
 return {records,get writes(){return writeCount;},loseReply(){lost=true;},unavailable(value){unavailable=value;},
  async read(key,recordVersion){if(unavailable)throw Error('read unavailable');const item=records.get(key);return item?structuredClone({exists:true,...item}):{exists:false,etag:null,record:null};},
  async write(key,input){writeCount++;const old=records.get(key);if((old?.etag??null)!==input.ifMatch)throw Object.assign(Error('CAS conflict'),{code:'APP_DATA_CONFLICT'});const item={etag:String(++revision),record:{key,recordVersion:input.recordVersion,value:structuredClone(input.value)}};records.set(key,item);if(lost){lost=false;throw Error('reply lost');}return structuredClone(item);}};
}
const session=(storage,surfaceId)=>createWorkspaceSession({durableSession:storage,surfaceId},{SaveController,createSessionSaveAdapter});
test('window recovery stays independent and a closed locator copies only after an explicit restore',async()=>{
 const storage=memorySession(),first=session(storage,'window-one'),second=session(storage,'window-two');
 try{await first.load();await second.load();first.update(workspaceContext({selected:'current:alpha',query:'  Alpha  ',pane:'detail',objectPath:'项目/alpha/task.md',objectScroll:233,projectTab:'materials'}));second.update(workspaceContext({selected:'current:beta',scope:'archived'}));assert.equal(await first.flush({closed:true}),true);assert.equal(await second.flush(),true);
  const same=session(storage,'window-one'),fresh=session(storage,'window-three');try{assert.equal((await same.load()).query,'  Alpha  ');assert.equal(await fresh.load(),null);assert.equal(fresh.getRecent().selected,'current:alpha');const restored=fresh.takeRecent();assert.equal(restored.projectTab,'materials');fresh.update(restored);assert.equal(await fresh.flush(),true);assert.equal(storage.records.get('projects-workspace-window-two').record.value.selected,'current:beta');assert.equal(storage.records.get('projects-workspace-window-three').record.value.objectScroll,233);assert.equal(Object.hasOwn(storage.records.get('projects-workspace-window-two').record.value,'projectTab'),false);}finally{same.dispose();fresh.dispose();}
 }finally{first.dispose();second.dispose();}
});
test('lost session replies reconcile actual storage and unavailable reads cannot be reported as durable',async()=>{
 const storage=memorySession(),view=session(storage,'window');try{await view.load();view.update(workspaceContext({selected:'current:alpha'}));storage.loseReply();assert.equal(await view.flush(),true);assert.equal(storage.writes,1);view.update(workspaceContext({query:'pending'}));storage.loseReply();storage.unavailable(true);assert.equal(await view.flush(),false);assert.match(view.getIssue(),/reply lost|read unavailable/);storage.unavailable(false);assert.equal(await view.flush(),true);assert.equal(storage.writes,2);}finally{view.dispose();}
});
test('incompatible recovery records remain intact and unsafe coordinates cannot become project identity',async()=>{
 const storage=memorySession();storage.records.set('projects-workspace-window',{etag:'original',record:{key:'projects-workspace-window',recordVersion:1,value:{schema:99,selected:'current:../escape'}}});const view=session(storage,'window');try{assert.equal(await view.load(),null);assert.equal(await view.flush(),false);assert.equal(storage.writes,0);assert.equal(storage.records.get('projects-workspace-window').record.value.schema,99);}finally{view.dispose();}
 assert.equal(workspaceContext({selected:'current:../escape',objectPath:'../secret',detailScroll:Infinity}).selected,'');assert.equal(workspaceContext({objectPath:'../secret',detailScroll:Infinity}).objectPath,null);
});
test('file recovery keeps a fixed digest and scroll as view coordinates, rejecting unsafe locators',()=>{
 const fileView={objectPath:'项目/alpha/task.md',path:'项目/alpha/proof.md',kind:'file',digest:'a'.repeat(64),scroll:254};
 assert.deepEqual(workspaceContext({detailSection:'acceptance',fileView}).fileView,fileView);assert.equal(workspaceContext({detailSection:'acceptance'}).detailSection,'acceptance');
 for(const bad of [{...fileView,path:'../secret'},{...fileView,objectPath:'/absolute'},{...fileView,digest:'latest'}])assert.equal(workspaceContext({fileView:bad}).fileView,undefined);
});


test('catalog project files restore with implicit project identity and keep fixed versions',()=>{
 const path='项目/alpha/project.md',fileView={objectPath:path,path:'项目/alpha/10-说明.md',kind:'file',scroll:177,digest:'a'.repeat(64)},location=workspaceContext({selected:'current:alpha',fileView});
 const before=structuredClone(location);
 assert.deepEqual(workspaceFileReference(location,path),{path:fileView.path,kind:'file',digest:fileView.digest});
 assert.equal(workspaceFileReference({...location,objectPath:'项目/alpha/M1/task.md'},path),null);
 assert.equal(workspaceFileReference(location,'项目/beta/project.md'),null);
 assert.equal(workspaceFileReference({...location,fileView:{...fileView,path:'../escape'}},path),null);
 assert.deepEqual(location,before);
});
