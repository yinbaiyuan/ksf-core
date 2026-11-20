import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {fixture} from './helpers/governance-fixture.js';
import {taskExecution,executionStatus} from '../src/projects/task-execution.js';
import {projectGovernance} from '../src/services/project-governance.js';
function ready(t){const f=fixture(t);f.initialize();assert.deepEqual(f.apply([f.change(f.tp,{status:'active'})]).errors,[]);return {...f,execute:(chatId,action,extra={})=>taskExecution(f.root,{chatId,action,taskRef:f.tp,...extra})};}
test('reading does not acquire; same-chat acquisition retries reuse a token without changing business state',t=>{
 const f=ready(t),before=readFileSync(join(f.root,f.tp)),files=readdirSync(f.root,{recursive:true});assert.equal(executionStatus(f.root,f.tp,'a').claim,null);assert.deepEqual(readdirSync(f.root,{recursive:true}),files);
 const first=f.execute('a','acquire');assert.equal(f.execute('a','acquire').claim.token,first.claim.token);assert.deepEqual(readFileSync(join(f.root,f.tp)),before);assert.throws(()=>f.execute('b','acquire'),{code:'PROJECT_EXECUTION_BUSY'});assert(executionStatus(f.root,f.tp,'b').blocked);assert(!executionStatus(f.root,f.tp,'b').claim.token);
});
test('explicit settled takeover invalidates the old token, protects saves, and never changes task state',t=>{
 const f=ready(t),a=f.execute('a','acquire').claim;
 const save=(chat,token,next)=>projectGovernance({root:f.root,name:f.name,operation:'apply',data:{operationId:'save-'+next,ifMatch:f.read().etag,changes:[f.change(f.tp,{next_action:next})],execution:{task_id:'t1',token}}},{chatId:chat});
 assert.deepEqual(save('a',a.token,'first').errors,[]);assert.equal(save('b',a.token,'wrong').errors[0].code,'PROJECT_EXECUTION_BUSY');
 assert.throws(()=>f.execute('b','takeover',{ifMatch:a.etag,reason:'用户选择新聊天'}),{code:'PROJECT_EXECUTION_TAKEOVER'});
 const b=f.execute('b','takeover',{ifMatch:a.etag,reason:'用户明确选择接手，旧运行已结束',previousRunSettled:true}).claim;
 assert.throws(()=>f.execute('a','check',{token:a.token}),{code:'PROJECT_EXECUTION_LOST'});assert.throws(()=>f.execute('a','release',{token:a.token}),{code:'PROJECT_EXECUTION_LOST'});assert(save('a',a.token,'old-save').errors.length);assert.deepEqual(save('b',b.token,'new-save').errors,[]);
 assert.equal(f.read().documents.find(d=>d.path===f.tp).metadata.status,'active');assert(f.execute('b','release',{token:b.token}).released);assert.equal(save('b',b.token,'released-save').errors[0].code,'PROJECT_EXECUTION_LOST');assert.equal(f.execute('b','release',{token:b.token}).released,false);
});
test('time alone does not expire execution ownership and unready tasks cannot acquire',t=>{
 const f=ready(t),a=f.execute('a','acquire').claim,home=join(f.root,'.agents/runtime-data/projects/executions'),path=join(home,readdirSync(home)[0]),stored=JSON.parse(readFileSync(path));stored.acquired_at='1970-01-01T00:00:00Z';writeFileSync(path,JSON.stringify(stored));assert.throws(()=>f.execute('b','acquire'),{code:'PROJECT_EXECUTION_BUSY'});f.execute('a','release',{token:a.token});f.apply([f.change(f.tp,{status:'paused',status_reason:'用户暂停',resume_condition:'用户选择恢复'})]);assert.throws(()=>f.execute('b','acquire'),{code:'PROJECT_EXECUTION_NOT_READY'});
});
test('concurrent native processes allow only one task execution and one side effect',async t=>{
 const f=ready(t),module=new URL('../src/projects/task-execution.js',import.meta.url).href,script=`import {taskExecution} from ${JSON.stringify(module)};import {writeFileSync} from 'node:fs';for(let i=0;i<100;i++){try{const r=taskExecution(process.argv[1],{chatId:process.argv[2],action:'acquire',taskRef:process.argv[3]});writeFileSync(process.argv[1]+'/executed',process.argv[2],{flag:'wx'});console.log('owned');break;}catch(e){if(e.code==='PROJECT_LOCKED'){await new Promise(r=>setTimeout(r,5));continue;}console.log(e.code);break;}}`;
 const child=id=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--input-type=module','-e',script,f.root,id,f.tp]);let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.once('error',reject);p.once('exit',code=>code?reject(Error(err)):resolve(out.trim()));});
 const results=await Promise.all([child('a'),child('b')]);assert.equal(results.filter(x=>x==='owned').length,1);assert.equal(results.filter(x=>x==='PROJECT_EXECUTION_BUSY').length,1);assert(['a','b'].includes(readFileSync(join(f.root,'executed'),'utf8')));
});
test('explicit user maintenance can pause an occupied task; commit releases ownership without restarting work',t=>{
 const f=ready(t),a=f.execute('a','acquire').claim;
 const out=projectGovernance({root:f.root,name:f.name,operation:'apply',data:{operationId:'user-pauses-occupied-task',ifMatch:f.read().etag,changes:[f.change(f.tp,{status:'paused',status_reason:'用户暂停',resume_condition:'用户选择继续'})]}},{caller:{source:'surface',humanWindow:true}});
 assert.deepEqual(out.errors,[]);assert.equal(executionStatus(f.root,f.tp,'a').claim,null);assert.throws(()=>f.execute('a','check',{token:a.token}),{code:'PROJECT_EXECUTION_NOT_READY'});
});
test('corrupt ownership blocks execution while ordinary project reading preserves the damaged record',t=>{
 const f=ready(t);f.execute('a','acquire');const home=join(f.root,'.agents/runtime-data/projects/executions'),path=join(home,readdirSync(home)[0]);writeFileSync(path,'{broken');
 const state=f.read();assert(state.valid);assert(state.executionClaims.t1.error);assert.equal(readFileSync(path,'utf8'),'{broken');assert.throws(()=>f.execute('a','acquire'));
});
