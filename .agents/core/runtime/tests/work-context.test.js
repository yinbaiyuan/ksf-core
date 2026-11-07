import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { routingFixture } from './helpers/routing-fixture.js';
import { enableChat, readChat, readChatContext } from '../src/services/chat.js';
import { readCurrentWork, bindCurrentWork, currentWorkContext, acceptWorkContext, resetWorkContext, createWorkContext, CURRENT_WORK_KEY } from '../src/services/work-context.js';
import { workContextHook, installContextHooks } from '../src/services/context-hook.js';
import { runContextCommand } from '../src/commands/context.js';
import {project} from '../src/services/projects.js';

function fixture(t) {
 const f=routingFixture(t),identity={host:'codex',sessionId:randomUUID()},o={root:f.root,identity};
 enableChat({root:f.root,at:'2026-01-01T00:00:00Z'});
 const add=(id,refs=[],body=id,source='system')=>{const path=f.add(id,source);writeFileSync(path,'---\n'+JSON.stringify({id,name:id,description:'temporary method',version:'0.1.0',status:'active',references:refs,...(source==='user'?{user_revision:1}:{})})+'\n---\n'+body+'\n');return path;};
 add('competency.test.persona',['+/USER.md','+/BOT.md']);
 add('partner.ksf.runtime',['#competency.test.persona@0.1.0']);
 add('competency.test.common');add('competency.test.a',['+competency.test.common@0.1.0']);add('competency.test.b',['+competency.test.common@0.1.0']);
 writeFileSync(join(f.root,'USER.md'),'\ufeff# User\r\nUSER_FULL_CANARY\r\n');writeFileSync(join(f.root,'BOT.md'),'# Bot\nBOT_FULL_CANARY\n');
 const current=()=>({schemaVersion:1,goal:'work A',status:'active',ownership:{state:'none'},executor:{ref:'competency.test.a@0.1.0',source:'system'},methods:[],files:[],taskRef:null});
 const bind=(value=current())=>bindCurrentWork({...o,current:value,ifMatch:readCurrentWork(o).etag});
 const get=(extra={})=>currentWorkContext({...o,...extra});
 const accept=p=>acceptWorkContext({...o,delivery:p.delivery});
 return {...f,o,identity,add,current,bind,get,accept};
}
test('binding reuses shared scope without native turns or participation; reads remain nonmutating',t=>{
 const f=fixture(t);assert.equal(readCurrentWork(f.o).current,null);const p=f.get();assert.equal(p.bodies.length,4);assert(!existsSync(join(f.root,'.agents/runtime-data/context')));
 f.bind();assert.equal(readChat(f.o).values[CURRENT_WORK_KEY].goal,'work A');assert.equal(readChat(f.o).system.chatTurnNumber,null);
 assert.equal(readChatContext(f.o).abilities.length,0);assert.equal(readCurrentWork(f.o).current.executor.source,'system');
 assert.equal(f.bind().changed,false);assert.throws(()=>bindCurrentWork({...f.o,current:null,ifMatch:'missing'}),{code:'CHAT_CONFLICT'});
});
test('complete consumption enables zero-body reuse, preserving exact USER/BOT',t=>{
 const f=fixture(t);f.bind();const first=f.get();assert(first.complete);assert.equal(first.bodies.find(x=>x.path==='USER.md').file.content,'\ufeff# User\r\nUSER_FULL_CANARY\r\n');
 assert.equal(f.get().bodies.length,first.bodies.length);f.accept(first);assert.equal(f.get().bodies.length,0);assert.equal(f.get().active.length,6);
});
test('switch retires only old uses, keeps shared dependencies and reuses previously read content',t=>{
 const f=fixture(t);f.bind();f.accept(f.get());f.bind({...f.current(),executor:{ref:'competency.test.b@0.1.0',source:'system'}});
 let p=f.get();assert.deepEqual(p.bodies.map(x=>x.ref),['competency.test.b@0.1.0']);assert.equal(p.retired.length,1);assert.equal(p.retired[0].ref,'competency.test.a@0.1.0');f.accept(p);
 f.bind();p=f.get();assert.equal(p.bodies.length,0);assert.equal(p.retired[0].ref,'competency.test.b@0.1.0');
});
test('changed file or definition sends only the changed main text and invalidates stale delivery',t=>{
 const f=fixture(t);f.bind();f.accept(f.get());writeFileSync(join(f.root,'BOT.md'),'# Bot\nCHANGED_BOT\n');let p=f.get();assert.equal(p.bodies.length,1);assert.equal(p.bodies[0].path,'BOT.md');f.accept(p);
 p=f.get();f.add('competency.test.a',['+competency.test.common@0.1.0'],'CHANGED_METHOD');assert.throws(()=>f.accept(p),{code:'CONTEXT_DELIVERY_CHANGED'});
 p=f.get();assert.equal(p.bodies.length,1);assert.match(p.bodies[0].object.body,/CHANGED_METHOD/);
});
test('project root and selected checkpoint enter context, unrelated files stay unloaded',t=>{
 const f=fixture(t);f.addProject('demo');mkdirSync(join(f.root,'项目/demo/任务'));writeFileSync(join(f.root,'项目/demo/任务/task.md'),'# CURRENT_CHECKPOINT');writeFileSync(join(f.root,'项目/demo/unrelated.md'),'DO_NOT_LOAD');
 f.bind({...f.current(),ownership:{state:'bound',target:{kind:'project',name:'demo',scope:'current'}},taskRef:'项目/demo/任务/task.md'});
 const p=f.get();assert(p.complete);assert(p.bodies.some(x=>x.path==='项目/demo/project.md'));assert.match(p.bodies.find(x=>x.path.endsWith('task.md')).file.content,/CURRENT_CHECKPOINT/);assert(!JSON.stringify(p).includes('DO_NOT_LOAD'));
});
test('missing required capability preserves partial output and cannot advance cache',t=>{
 const f=fixture(t);f.bind();unlinkSync(join(f.root,'.agents/core/abilities/competencies/competency.test.a/competency.md'));const p=f.get();assert.equal(p.complete,false);assert(p.bodies.some(x=>x.path==='USER.md'));assert.equal(p.delivery,null);assert.throws(()=>f.accept(p),{code:'INVALID_ARGUMENTS'});
});
test('source/version binding and file policy reject implicit replacement or protected files',t=>{
 const f=fixture(t);assert.throws(()=>f.bind({...f.current(),executor:{ref:'competency.test.a@9.0.0',source:'system'}}),{code:'OBJECT_VERSION_MISMATCH'});
 f.bind({...f.current(),files:[{path:'.agents/runtime-data/private.json',purpose:'material'}]});assert(f.get().errors.some(e=>e.code==='FILE_REFERENCE_PROTECTED'));
 assert.throws(()=>f.bind({...f.current(),files:[{path:'../USER.md',purpose:'material'}]}),{code:'INVALID_ARGUMENTS'});
});
test('ability ownership and related targets pin resolved versions/sources without replacing planned identities',t=>{
 const f=fixture(t),planned={kind:'ability',lifecycle:'planned',name:'future method'};
 const bound=f.bind({...f.current(),ownership:{state:'bound',target:{kind:'ability',ref:'competency.test.a',source:'effective'}},
  relatedTargets:[{kind:'ability',ref:'competency.test.b',source:'effective'},planned]});
 assert.deepEqual(bound.current.ownership.target,{kind:'ability',ref:'competency.test.a@0.1.0',source:'system'});
 assert.deepEqual(bound.current.relatedTargets,[{kind:'ability',ref:'competency.test.b@0.1.0',source:'system'},planned]);
 f.add('competency.test.a',[],'USER_OVERRIDE_A','user');f.add('competency.test.b',[],'USER_OVERRIDE_B','user');
 assert.deepEqual(readCurrentWork(f.o).current.ownership.target,bound.current.ownership.target);
 assert(f.get().complete);assert.equal(f.bind(readCurrentWork(f.o).current).current.relatedTargets[0].source,'system');
});
test('compaction reset rejects delayed confirmations including empty-cache ABA and preserves binding/counters',t=>{
 const f=fixture(t);f.bind();let p=f.get();resetWorkContext(f.o);assert.throws(()=>f.accept(p),e=>['CHAT_CONFLICT','CONTEXT_DELIVERY_CHANGED'].includes(e.code));
 f.accept(f.get());assert.equal(f.get().pending.length,0);resetWorkContext(f.o);assert.equal(f.get().pending.length,6);assert.equal(readCurrentWork(f.o).current.goal,'work A');assert.equal(readChat(f.o).system.chatTurnNumber,null);
});
test('binding change rejects a delayed acknowledgment; corrupt disposable cache can recover',t=>{
 const f=fixture(t);f.bind();const p=f.get();f.bind({...f.current(),goal:'new goal'});assert.throws(()=>f.accept(p),{code:'CONTEXT_DELIVERY_CHANGED'});f.accept(f.get());
 const path=join(f.root,'.agents/runtime-data/context',readCurrentWork(f.o).chatId+'.json');writeFileSync(path,Buffer.from([0xff,0x00]));const recovered=f.get();assert(recovered.cacheDiscarded);assert.equal(recovered.pending.length,6);f.accept(recovered);assert.equal(f.get().pending.length,0);
});
test('base entry acknowledgment does not retire work and avoids startup duplicate bodies',async t=>{
 const f=fixture(t),env={CODEX_THREAD_ID:f.identity.sessionId};const e=JSON.parse((await runContextCommand(['entry','--json'],f.root,{env})).stdout);assert(e.data.delivery);f.accept({delivery:e.data.delivery});
 f.bind();let p=f.get();assert.equal(p.bodies.length,2);f.accept(p);const active=p.active.length;
 const e2=JSON.parse((await runContextCommand(['entry','--json'],f.root,{env})).stdout);f.accept({delivery:e2.data.delivery});p=f.get();assert.equal(p.active.length,active);assert.equal(p.retired.length,0);assert.equal(p.bodies.length,0);
});
test('turn-local support never changes primary binding and clear retires current work',t=>{
 const f=fixture(t);f.bind();f.accept(f.get());const p=f.get({extras:[{ref:'competency.test.b@0.1.0',source:'system'}]});assert.equal(readCurrentWork(f.o).current.executor.ref,'competency.test.a@0.1.0');f.accept(p);
 assert(f.get().retired.some(x=>x.purposes.includes('turn-support')));f.bind(null);assert.equal(readCurrentWork(f.o).current,null);assert(f.get().retired.some(x=>x.purposes.includes('executor')));
});
test('native Hook is small and body-free; SessionStart restores without fake turns; installation preserves other hooks',t=>{
 const f=fixture(t);f.bind();f.accept(f.get());const path=join(f.root,'native.jsonl');writeFileSync(path,JSON.stringify({type:'session_meta',payload:{id:f.identity.sessionId,cwd:f.root,timestamp:'2026-01-02T00:00:00Z'}})+'\n');
 const input={session_id:f.identity.sessionId,transcript_path:path,hook_event_name:'UserPromptSubmit'};
 const text=workContextHook({root:f.root,input}).hookSpecificOutput.additionalContext;assert(!text.includes('USER_FULL_CANARY'));assert.match(text,/"readRequired":false/);
 const restored=workContextHook({root:f.root,input:{...input,hook_event_name:'SessionStart',source:'compact'}});assert.match(restored.hookSpecificOutput.additionalContext,/"readRequired":true/);assert.equal(readChat(f.o).system.chatTurnNumber,null);
 mkdirSync(join(f.root,'.codex'));writeFileSync(join(f.root,'.codex/hooks.json'),JSON.stringify({hooks:{Stop:[{hooks:[{type:'command',command:'user-command'}]}]}}));installContextHooks(f.o);const before=readFileSync(join(f.root,'.codex/hooks.json'),'utf8');installContextHooks(f.o);assert.equal(readFileSync(join(f.root,'.codex/hooks.json'),'utf8'),before);assert(before.includes('user-command'));
 const legacy=JSON.parse(before);legacy.hooks.UserPromptSubmit[0].hooks[0].additionalContextLimit=2500;writeFileSync(join(f.root,'.codex/hooks.json'),JSON.stringify(legacy));installContextHooks(f.o);
 assert.equal(JSON.parse(readFileSync(join(f.root,'.codex/hooks.json'))).hooks.UserPromptSubmit[0].hooks[0].additionalContextLimit,0);
});
test('CLI bind/current/accept preserve the same body and receipt contracts',async t=>{
 const f=fixture(t),env={CODEX_THREAD_ID:f.identity.sessionId},cli=async args=>JSON.parse((await runContextCommand(args,f.root,{env})).stdout);
 const bound=await cli(['bind','--data',JSON.stringify(f.current()),'--if-match','missing','--json']);assert(bound.ok);
 const p=await cli(['current','--json']);assert(p.ok&&p.data.bodies.length===6);assert((await cli(['accept','--data',JSON.stringify(p.data.delivery),'--json'])).ok);
 assert.equal((await cli(['current','--json'])).data.bodies.length,0);assert((await cli(['current','--reload','--json'])).data.bodies.length===6);
});
test('CLI extras use the shared incremental service without modifying the binding; invalid JSON cannot reset the cache',async t=>{
 const f=fixture(t),env={CODEX_THREAD_ID:f.identity.sessionId},cli=async args=>JSON.parse((await runContextCommand(args,f.root,{env})).stdout);
 f.bind();f.accept(f.get());const before=readCurrentWork(f.o),extra={ref:'competency.test.b@0.1.0',source:'system'};
 let p=await cli(['current','--extras',JSON.stringify([extra]),'--json']);assert(p.ok);
 assert.deepEqual(p.data.bodies.map(x=>x.ref),[extra.ref]);assert.equal(readCurrentWork(f.o).etag,before.etag);
 assert((await cli(['accept','--data',JSON.stringify(p.data.delivery),'--json'])).ok);
 p=await cli(['current','--extras',JSON.stringify([extra]),'--json']);assert.equal(p.data.bodies.length,0);
 assert(f.get().retired.some(x=>x.ref===extra.ref&&x.purposes.includes('turn-support')));
 const generation=f.get().generation;
 const invalid=await cli(['current','--reload','--extras','{','--json']);assert.equal(invalid.ok,false);assert.equal(invalid.errors[0].code,'INVALID_ARGUMENTS');assert.equal(f.get().generation,generation);
 assert.equal((await cli(['current','--extras',JSON.stringify(Array(33).fill(extra)),'--json'])).ok,false);
});
test('work partners and stage methods survive switching and the compact Hook while common dependencies stay active',t=>{
 const f=fixture(t);f.add('partner.test.design');f.add('partner.test.refine');f.addProject('demo');
 mkdirSync(join(f.root,'项目/demo/任务'));writeFileSync(join(f.root,'项目/demo/任务/task.md'),'# Actual stage checkpoint\n');
 const a={...f.current(),executor:{ref:'partner.test.design@0.1.0',source:'system'},methods:[{ref:'competency.test.a@0.1.0',source:'system'}],ownership:{state:'bound',target:{kind:'project',name:'demo',scope:'current'}},taskRef:'项目/demo/任务/task.md'};
 f.bind(a);f.accept(f.get());
 const b={...a,executor:{ref:'partner.test.refine@0.1.0',source:'system'},methods:[{ref:'competency.test.b@0.1.0',source:'system'}]};
 f.bind(b);let p=f.get();assert.deepEqual(p.bodies.map(x=>x.ref),[b.executor.ref,b.methods[0].ref]);
 assert(p.retired.some(x=>x.ref===a.executor.ref));assert(p.retired.some(x=>x.ref===a.methods[0].ref));assert(!p.retired.some(x=>x.ref==='competency.test.common@0.1.0'));f.accept(p);
 const before=readCurrentWork(f.o),generation=f.get().generation,source=join(f.root,'native.jsonl');writeFileSync(source,JSON.stringify({type:'session_meta',payload:{id:f.identity.sessionId,cwd:f.root}})+'\n');
 workContextHook({root:f.root,input:{session_id:f.identity.sessionId,transcript_path:source,hook_event_name:'SessionStart',source:'compact'}});
 p=f.get();assert.notEqual(p.generation,generation);assert.equal(readCurrentWork(f.o).etag,before.etag);assert(p.bodies.some(x=>x.ref===b.executor.ref));assert(p.bodies.some(x=>x.ref===b.methods[0].ref));assert(!p.active.some(x=>x.ref===a.executor.ref));assert(p.bodies.some(x=>x.path===b.taskRef));f.accept(p);assert.equal(f.get().bodies.length,0);
 f.bind(a);p=f.get();assert.equal(p.bodies.filter(x=>x.ref===a.executor.ref||x.ref===a.methods[0].ref).length,2);
});
test('read-only body and manifest calls do not alter an acknowledged binding, cache or participation',t=>{
 const f=fixture(t);f.bind();f.accept(f.get());const r=readCurrentWork(f.o),scope=join(f.root,'.agents/user-data/chats',r.chatId,'shared.json'),cache=join(f.root,'.agents/runtime-data/context',r.chatId+'.json');
 const original=[readFileSync(scope),readFileSync(cache)],support=[{ref:'competency.test.b@0.1.0',source:'system'}];
 assert(f.get({extras:support}).bodies.some(x=>x.ref===support[0].ref));assert(f.get({manifestOnly:true,extras:support}).pending.some(x=>x.ref===support[0].ref));
 assert.deepEqual(readFileSync(scope),original[0]);assert.deepEqual(readFileSync(cache),original[1]);assert.equal(readChatContext(f.o).abilities.length,0);
});
test('multiple roots upgrade recursive traversal while deduplicating body content and cycles',t=>{
 const f=fixture(t);f.add('competency.test.leaf');f.add('competency.test.common',['#competency.test.leaf@0.1.0']);
 f.add('competency.test.leaf',['#competency.test.common@0.1.0']);
 f.bind({...f.current(),methods:[{ref:'competency.test.common@0.1.0',source:'system'}]});const p=f.get();assert(p.complete);
 assert.equal(p.active.filter(x=>x.ref==='competency.test.common@0.1.0').length,1);assert(p.active.some(x=>x.ref==='competency.test.leaf@0.1.0'));
});
test('corrupt business binding stays an error; SDK cannot inject fabricated entry content',t=>{
 const f=fixture(t);f.bind();const r=readCurrentWork(f.o),path=join(f.root,'.agents/user-data/chats',r.chatId,'shared.json');
 const d=JSON.parse(readFileSync(path));d.values[CURRENT_WORK_KEY]={schemaVersion:99};writeFileSync(path,JSON.stringify(d));
 assert.throws(()=>f.get(),{code:'INVALID_ARGUMENTS'});assert.equal(JSON.parse(readFileSync(path)).values[CURRENT_WORK_KEY].schemaVersion,99);
 assert.throws(()=>createWorkContext(f.root).current({identity:f.identity,entry:{entry:{content:'INJECTED'}}}),{code:'INVALID_ARGUMENTS'});
});

test('archive invalidates cached execution across chats without rewriting either binding; restore retains paused state',t=>{
 const f=fixture(t),name='封存样例',pp='项目/'+name+'/project.md',tp='项目/'+name+'/现场.md';
 const p={governance_schema:2,kind:'project',id:'archive-context-project',name,status:'paused',owner:'Agent',updated:new Date().toISOString(),next_action:'恢复时核对目标',blocker:null,resume_condition:'有新输入',status_reason:'暂时不做',resume_status:'active',level:'A',mode:'finite',phase:'execution',parent_project:null,child_projects:[],milestones:[],focus_milestones:[],wip_limit:1,goals:[],criteria:[{id:'done',text:'交付结果'}],review_ref:null,risks:[],decisions:[]};
 mkdirSync(join(f.root,'项目',name),{recursive:true});writeFileSync(join(f.root,pp),'---\n'+JSON.stringify(p)+'\n---\n# 当前进度\n保留未决。');writeFileSync(join(f.root,tp),'现场原字节');
 f.bind({...f.current(),ownership:{state:'bound',target:{kind:'project',name,scope:'current'}},files:[],taskRef:tp});f.accept(f.get());
 const second={...f.o,identity:{host:'codex',sessionId:randomUUID()}};bindCurrentWork({...second,current:readCurrentWork(f.o).current,ifMatch:readCurrentWork(second).etag});acceptWorkContext({...second,delivery:currentWorkContext(second).delivery});
 const before=[f.o,second].map(o=>readCurrentWork(o));
 const data={reason:'暂时封存',actor:'测试Agent',targets:[{id:p.id,path:pp}]},preview=project({root:f.root,name,operation:'archive',data,dryRun:true});assert(preview.data.allowed);project({root:f.root,name,operation:'archive',data:{...data,operationId:'archive-context-isolated',ifMatch:preview.data.ifMatch}});
 for(const [i,o]of [f.o,second].entries()){const work=readCurrentWork(o);assert.equal(work.etag,before[i].etag);assert.deepEqual(work.current,before[i].current);assert(work.executionBlocked);const packet=currentWorkContext(o);assert(!packet.complete);assert(packet.errors.some(e=>e.code==='PROJECT_WORK_ARCHIVED'));assert(packet.bodies.some(b=>b.path==='档案/项目/'+name+'/现场.md'));}
 const restore={reason:'查看现场',actor:'测试Agent'},rp=project({root:f.root,name,operation:'restore',data:restore,dryRun:true});project({root:f.root,name,operation:'restore',data:{...restore,operationId:'restore-context-isolated',ifMatch:rp.data.ifMatch}});assert(!readCurrentWork(f.o).executionBlocked);assert.equal(project({root:f.root,name,operation:'read'}).data.project.metadata.status,'paused');
});

test('old taskRef resolves numbered task after migration without rewriting another chat binding',async t=>{
 const {defaultMetadata}=await import('../src/projects/governance/model.js'),{projectGovernance}=await import('../src/services/project-governance.js');const f=fixture(t);f.addProject('demo');const pp='项目/demo/project.md',mp='项目/demo/M1-交付/milestone.md',tp='项目/demo/M1-交付/T1-执行/task.md';
 const p={...defaultMetadata('project','p1','demo'),milestones:[{id:'m1',path:mp}]},m={...defaultMetadata('milestone','m1','交付'),project:{id:'p1',path:pp},tasks:[{id:'t1',path:tp}]},task={...defaultMetadata('task','t1','执行'),project:{id:'p1',path:pp},milestone:{id:'m1',path:mp}};
 const read=()=>projectGovernance({root:f.root,name:'demo'}).data;const initial=read();assert.deepEqual(projectGovernance({root:f.root,name:'demo',operation:'apply',data:{operationId:'context-seed-numbering',ifMatch:initial.etag,changes:[[pp,p],[mp,m],[tp,task]].map(([path,metadata])=>({path,ifMatch:path===pp?initial.project.etag:'missing',metadata,body:'# 原始任务\n'}))}}).errors,[]);
 f.bind({...f.current(),taskRef:tp});f.accept(f.get());const before=readCurrentWork(f.o),data={operationId:'context-task-numbering',ifMatch:read().etag,actor:'测试',reason:'更换展示编号',milestones:[{id:'m1',task_stages:[{code:'B',name:'实施',purpose:'取得结果',exit_criteria:'可以验收'}],tasks:[{id:'t1',code:'B1'}]}]},preview=projectGovernance({root:f.root,name:'demo',operation:'renumber',data,dryRun:true});assert.deepEqual(preview.errors,[]);assert.deepEqual(projectGovernance({root:f.root,name:'demo',operation:'renumber',data:{...data,ifMatch:preview.data.ifMatch}}).errors,[]);
 const packet=f.get();assert(packet.complete);assert(packet.active.some(x=>x.path?.includes('/B1-执行/task.md')));assert.equal(readCurrentWork(f.o).etag,before.etag);assert.equal(readCurrentWork(f.o).current.taskRef,tp);f.accept(packet);assert(f.get().complete);
});
