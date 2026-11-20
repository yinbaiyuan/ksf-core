import {writeNodeExecutable,testEndpoint} from './helpers/platform.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Frames, frame, parse, stringify, DesktopIPC, requestRef } from '../src/codex-conversations/protocol.js';
import { createDraft, desktopProjectForRoot } from '../src/codex-conversations/app-server.js';
import { questionsOf, messagesOf, activeTurn, pageMessages, turnsOf,toolsOf,outcomeOf,summaryOf } from '../src/codex-conversations/state.js';
import { createCodexConversations } from '../src/services/codex-conversations.js';
import { sessionKey } from '../src/routing/storage.js';
import {createCodexConversationsClient} from '../../applications/sdk/src/codex-conversations.ts';
import {createDesktopRunAdapter} from '../../applications/sdk/src/controllers/run-adapters.ts';
import {RunController} from '../../applications/sdk/src/controllers/run-controller.ts';
import {createStore} from '../src/codex-conversations/store.js';
const caller = { appId: 'example.projects', version: '1.0.0' };
const threadId = 'thread-00000001', turnId = 'turn-000000001';
const delay = ms => new Promise(r => setTimeout(r, ms));

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'ksf-codex-'));
  await mkdir(join(root, '项目/虚构项目'), { recursive: true });
  await writeFile(join(root, '项目/虚构项目/project.md'), '---\nname: 虚构项目\nstatus: active\n---\n# 虚构项目\n');
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function desktop(t, root) {
  const endpoint = testEndpoint(root), sockets = new Set(), requests = [];
  let owner = 'desktop-one', revision = 1, drop = false, apply = true, states = new Map(), starts = 0, expectedRef,startStatus='completed',autoSnapshots=false;
  const broadcastState=id=>{if(autoSnapshots)for(const socket of sockets)socket.write(frame({type:'broadcast',method:'thread-stream-state-changed',sourceClientId:owner,params:{conversationId:id,change:{type:'snapshot',revision,conversationState:states.get(id)}}}));};
  const server = createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket)); const frames = new Frames();
    socket.on('data', bytes => {
      for (const m of frames.push(bytes)) {
        if (m.type !== 'request') continue;
        requests.push(m);
        const reply = result => socket.write(frame({ type: 'response', requestId: m.requestId, result }));
        const id = m.params?.conversationId;
        if (m.method === 'initialize') reply({ clientId: 'test-client' });
        else if (m.method === 'thread-owner-discovery') reply({ handledByClientId: owner });
        else if (m.method === 'thread-follower-load-complete-history') {
          socket.write(frame({ type: 'broadcast', method: 'thread-stream-state-changed', sourceClientId: owner, params: { conversationId: id, change: { type: 'snapshot', revision, conversationState: states.get(id) ?? { id, turns: [] } } } })); reply({});
        } else if (m.method === 'thread-follower-start-turn') {
          starts++; const state = states.get(id) ?? { id, cwd: root, turns: [] };
          if(apply)state.turns.push({ id: turnId + starts, status: startStatus, items: [{ id: 'user-' + starts, type: 'userMessage', content: m.params.turnStart.request.input }, { id: 'assistant-' + starts, type: 'agentMessage', text: '虚构回复' }] }); states.set(id, state); revision++;broadcastState(id);
          if (!drop) reply({ turnId: turnId + starts });
        } else if (m.method === 'thread-follower-steer-turn') {
          const turn = states.get(id).turns.at(-1); turn.items.push({ id: 'steer-1', type: 'steeringUserMessage', status: 'accepted', input: m.params.input }); revision++;broadcastState(id); reply({ turnId: turn.id });
        } else if (m.method === 'thread-follower-interrupt-turn') { states.get(id).turns.at(-1).status = 'interrupted'; revision++;broadcastState(id); reply({}); }
        else if (m.method === 'thread-follower-submit-user-input') {
          expectedRef = m.params.requestId; states.get(id).requests = []; revision++;broadcastState(id); reply({});
        }
      }
    });
  });
  await new Promise(r => server.listen(endpoint, r));
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(r => server.close(r)); });
  return { endpoint, requests, states, set owner(v) { owner = v; }, get starts() { return starts; }, get ref() { return expectedRef; }, set drop(v) { drop = v; }, set apply(v) { apply = v; },set startStatus(v){startStatus=v;},set autoSnapshots(v){autoSnapshots=v;}, bump() { revision++; }, emit(id, rev, source = owner) { for (const socket of sockets) socket.write(frame({ type: 'broadcast', method: 'thread-stream-state-changed', sourceClientId: source, params: { conversationId: id, change: { type: 'snapshot', revision: rev, conversationState: { id, turns: [], marker: rev } } } })); }, disconnect() { for (const socket of sockets) socket.destroy(); } };
}
async function serviceFixture(t, { timeoutMs = 500 } = {}) {
  const root = await fixture(t), peer = await desktop(t, root), ipc = new DesktopIPC(peer.endpoint, { timeoutMs });
  const catalog = [];
  const options = { isolated: true, platform: 'darwin', ipc, locateCLI: async () => '/synthetic/codex', catalog: () => catalog, openDesktop: async () => {}, createDraft: async ({ root, onCreated }) => {
    const path = join(root, threadId + '.jsonl'); await writeFile(path, JSON.stringify({ type: 'session_meta', payload: { id: threadId, cwd: root, source: 'vscode' } }) + '\n'); catalog.push(path); await onCreated(threadId); return threadId;
  } };
  const service = createCodexConversations(root, options); t.after(() => service.close());
  return { root, peer, ipc, service, options };
}
async function finish(service, op, client = caller) {
  const until = Date.now() + 4000;
  while (Date.now() < until) {
    const next = await service.operation(client, { operationId: op.operationId });
    if (['accepted', 'succeeded', 'unknown', 'failed'].includes(next.status)) return next;
    await delay(10);
  }
  throw new Error('operation did not finish');
}
const createParams = { operationId: 'create-op-0001', project: { name: '虚构项目', scope: 'current' }, text: '虚构材料\r\n  保留原文\n' };

test('activity monitor observes only bound native turns and rejects a stale stop before dispatch',async t=>{
  const {service,peer}=await serviceFixture(t);await finish(service,service.create(caller,createParams));
  const state=peer.states.get(threadId);state.turns.at(-1).status='running';peer.bump();
  let row;for(let i=0;i<100;i++){row=(await service.monitorSnapshot()).tasks[0];if(row)break;await delay(10);}
  assert.equal(row.kind,'conversation');assert.equal(row.turnId,state.turns.at(-1).id);
  state.turns.push({id:'newer-turn-0001',status:'running',items:[]});peer.bump();
  const count=peer.requests.filter(r=>r.method==='thread-follower-interrupt-turn').length;
  await assert.rejects(service.monitorInterrupt({threadId,turnId:row.turnId,version:row.version,operationId:'monitor-old-stop'}),{code:'MONITOR_STALE'});
  assert.equal(peer.requests.filter(r=>r.method==='thread-follower-interrupt-turn').length,count);
  const current=await service.read(caller,{threadId});const op=await service.monitorInterrupt({threadId,turnId:current.turnId,version:current.version,operationId:'monitor-new-stop'});await finish(service,op);
  assert.equal(state.turns.at(-1).status,'interrupted');
});
test('bound observation revalidates the known native original without repeated discovery',async t=>{
  const {service,options,root}=await serviceFixture(t);await finish(service,service.create(caller,createParams));const original=options.catalog;let discoveries=0;options.catalogTtlMs=0;options.catalog=()=>{discoveries++;return original();};
  await service.read(caller,{threadId});assert.equal(discoveries,1);discoveries=0;await service.read(caller,{threadId});await service.read(caller,{threadId});assert.equal(discoveries,0);
  const path=join(root,threadId+'.jsonl');await writeFile(path,JSON.stringify({type:'session_meta',payload:{id:threadId,cwd:join(root,'different-root'),source:'vscode'}})+'\n');
  await assert.rejects(service.read(caller,{threadId}),{code:'CODEX_WORKSPACE_MISMATCH'});assert.equal(discoveries,0);
});

test('framing handles every split point, coalescing, invalid lengths and exact numeric request identities', () => {
  const raw = '{"id":9007199254740993,"str":"9007199254740993"}', value = parse(raw);
  assert.equal(typeof value.id, 'bigint'); assert.equal(stringify(value), raw); assert.notDeepEqual(requestRef(value.id), requestRef(value.str));
  const bytes = frame(value);
  for (let i = 0; i <= bytes.length; i++) { const decoder = new Frames(); assert.deepEqual([...decoder.push(bytes.subarray(0, i)), ...decoder.push(bytes.subarray(i))], [value]); }
  assert.equal(new Frames().push(Buffer.concat([bytes, bytes])).length, 2);
  assert.throws(() => new Frames().push(Buffer.from([255, 255, 255, 255])), { code: 'CODEX_PROTOCOL' });
});
test('Desktop handshake, authoritative owner, numeric stale snapshots and reconnect generations', async t => {
  const root = await fixture(t), peer = await desktop(t, root), ipc = new DesktopIPC(peer.endpoint); t.after(() => ipc.close());
  const a = await ipc.load(threadId, { fresh: true }); assert.equal(a.owner, 'desktop-one');
  peer.emit(threadId, 99); await delay(20); peer.emit(threadId, 98); peer.emit(threadId, 100, 'untrusted-observer'); await delay(20);
  assert.equal(ipc.snapshots.get(threadId).revision, '99');
  peer.owner = 'desktop-two'; await ipc.owner(threadId); assert.equal(ipc.snapshots.has(threadId), false);
  const b = await ipc.load(threadId, { fresh: true }); assert.equal(b.owner, 'desktop-two');
  peer.disconnect(); await delay(30); const c = await ipc.load(threadId); assert.ok(c.generation > a.generation);
  assert.equal(ipc.pending.size, 0);
});
test('Node draft has no model turn, injects only facts and waits for writer exit', async t => {
  const root = await fixture(t), executable = join(root, 'mock-codex'), log = join(root, 'log');
  writeNodeExecutable(executable, `#!${process.execPath}\nconst fs=require('fs'),rl=require('readline').createInterface({input:process.stdin});let closed=false;const close=()=>{if(!closed){closed=true;fs.appendFileSync(${JSON.stringify(log)},'closed\\n');}process.exit(0)};process.on('SIGTERM',close);rl.on('close',close);rl.on('line',s=>{const m=JSON.parse(s);fs.appendFileSync(${JSON.stringify(log)},m.method+'\\n');if(m.id)process.stdout.write(JSON.stringify({id:m.id,result:m.method==='project/list'?{data:[{id:'native-ksf-project',name:'ksf',roots:[{path:${JSON.stringify(root)}}]}]}:m.method==='thread/start'?{thread:{id:'${threadId}',projectId:'native-ksf-project'}}:{}})+'\\n')});`);
  assert.equal(await createDraft({ root, name: '虚构任务', executable }), threadId);
  const lines = (await readFile(log, 'utf8')).trim().split('\n');
  assert.deepEqual(lines, ['initialize', 'initialized', 'project/list', 'thread/start', 'thread/name/set', 'thread/inject_items', 'closed']);
});
test('create dispatches exactly once, preserves original bytes, uses inherited Desktop settings, stores no prompt', async t => {
  const { service, peer, root } = await serviceFixture(t);
  const op = service.create(caller, createParams); assert.equal(op.status, 'queued');
  const done = await finish(service, op); assert.equal(done.status, 'accepted');
  service.create(caller, createParams); assert.equal(peer.starts, 1);
  assert.throws(() => service.create(caller, { ...createParams, text: '不同内容' }), { code: 'CODEX_OPERATION_CONFLICT' });
  const request = peer.requests.find(m => m.method === 'thread-follower-start-turn');
  assert.deepEqual(Object.keys(request.params.turnStart.request), ['threadId', 'cwd', 'input']);
  assert.equal(request.params.turnStart.context.inheritThreadSettings, true);
  assert.ok(request.params.turnStart.request.input[0].text.includes('--- 用户原文开始 ---\n' + createParams.text + '\n--- 用户原文结束 ---'));
  const stored = await readFile(join(root, '.agents/user-data/codex-conversations/v1/state.json'), 'utf8'); assert.ok(!stored.includes('保留原文'));
  assert.equal((await service.read(caller, { threadId })).ksf.hookState, 'unconfirmed'); // Never fabricate a native Hook.
});
test('lost acknowledgement is reconciled from one canonical message and never resent across service restart', async t => {
  const { service, peer, root, options } = await serviceFixture(t, { timeoutMs: 50 }); peer.drop = true;
  const op = service.create(caller, createParams), done = await finish(service, op);
  assert.equal(done.status, 'accepted'); assert.equal(peer.starts, 1);
  await service.close();
  const restarted = createCodexConversations(root, { ...options, ipc: new DesktopIPC(peer.endpoint, { timeoutMs: 50 }) }); t.after(() => restarted.close());
  assert.equal(restarted.create(caller, createParams).status, 'accepted'); assert.equal(peer.starts, 1);
});
test('uncertain delivery blocks a different operation; replay accepts equivalent property order',async t=>{
  const {service,peer}=await serviceFixture(t,{timeoutMs:50});peer.drop=true;peer.apply=false;
  const done=await finish(service,service.create(caller,createParams));assert.equal(done.status,'unknown');
  assert.equal(service.create(caller,{text:createParams.text,project:{scope:'current',name:'虚构项目'},operationId:createParams.operationId}).status,'unknown');
  const blocked=await finish(service,service.send(caller,{operationId:'another-op-01',threadId,text:'不能绕过待核对',mode:'new'}));
  assert.equal(blocked.status,'failed');assert.equal(blocked.error.code,'CODEX_OUTCOME_UNKNOWN');assert.equal(peer.starts,1);
});
test('new vs steer is explicit, exact turn stop, stale answer rejection and big numeric question answers', async t => {
  const { service, peer, ipc } = await serviceFixture(t); await finish(service, service.create(caller, createParams));
  const state = peer.states.get(threadId); state.turns.at(-1).status = 'running'; peer.bump();
  const rejected = await finish(service, service.send(caller, { operationId: 'new-op-00001', threadId, text: '不能变成补充', mode: 'new' })); assert.equal(rejected.status, 'failed'); assert.equal(peer.starts, 1);
  const id = state.turns.at(-1).id;
  assert.equal((await finish(service, service.send(caller, { operationId: 'steer-op-0001', threadId, text: '补充原文', mode: 'steer', expectedTurnId: id }))).status, 'accepted');
  assert.equal(state.turns.length, 1); assert.equal(messagesOf(state).at(-1).text, '补充原文');
  assert.equal((await finish(service, service.interrupt(caller, { operationId: 'stop-op-00001', threadId, expectedTurnId: 'outdated-turn' }))).status, 'failed');
  assert.equal((await finish(service, service.interrupt(caller, { operationId: 'stop-op-00002', threadId, expectedTurnId: id }))).status, 'accepted');
  state.requests = [{ method: 'item/tool/requestUserInput', id: 9007199254740993n, params: { turnId: id, questions: [{ id: 'q', question: '虚构问题？', options: [{ label: '选项一' }] }] } }]; peer.bump();
  await ipc.load(threadId, { fresh: true });
  const fresh = await service.read(caller, { threadId });
  const q = fresh.questions[0]; assert.ok(q);
  assert.equal((await finish(service, service.answer(caller, { operationId: 'answer-op-0001', threadId, version: 'stale', request: q.request, answers: { q: ['选项一'] } }))).status, 'failed');
  const current = await service.read(caller, { threadId });
  const answered = await finish(service, service.answer(caller, { operationId: 'answer-op-0002', threadId, version: current.version, request: q.request, answers: { q: ['选项一'] } }));
  assert.equal(answered.status, 'succeeded'); assert.equal(peer.ref, 9007199254740993n);
});
test('async public questions and plans normalize without exposing approvals or secrets', () => {
  const state = { turns: [{ id: turnId, status: 'completed', items: [{ type: 'agentMessage', id: 'async-item', delivery: 'async', text: '问题', questions: [{ title: '虚构选择', options: ['甲', '乙'] }] }, { type: 'planImplementation', planContent: '虚构计划' }] }], requests: [{ method: 'item/tool/requestUserInput', id: 'secret', params: { questions: [{ id: 'x', isSecret: true }] } }] };
  const q = questionsOf(state); assert.equal(q.length, 1); assert.equal(q[0].questions[0].options[0].label, '甲');
  state.turns.push({ id: 'reply-turn', status: 'completed', items: [{ type: 'userMessage', id: 'reply', content: [{ type: 'text', text: '<send_user_message_question_reply>\n' + JSON.stringify([{ questionItemId: q[0].asyncId, answer: '甲' }]) + '\n</send_user_message_question_reply>' }] }] });
  assert.equal(questionsOf(state).length, 0);
  assert.equal(activeTurn(state), null);
  const page = pageMessages(Array.from({ length: 40 }, (_, i) => ({ id: String(i), text: 'x'.repeat(100000) })), 0, 40); assert.ok(page.records.length < 40); assert.equal(page.records[0].truncated, true);
});
test('unsupported platform, unknown fields, root restrictions and distinct fork identity', async t => {
  const { service, root } = await serviceFixture(t);
  assert.throws(() => service.create(caller, { ...createParams, cwd: '/elsewhere' }), { code: 'CODEX_ARGUMENT' });
  const other = createCodexConversations(root, { isolated: true, platform: 'linux' }); t.after(() => other.close()); assert.equal((await other.check(caller)).code, 'CODEX_PLATFORM_UNSUPPORTED');
  assert.throws(() => other.create(caller, createParams), { code: 'CODEX_PLATFORM_UNSUPPORTED' });
  const key = sessionKey(root, { host: 'codex', sessionId: threadId }, true);
  assert.notEqual(key, sessionKey(root, { host: 'codex', sessionId: 'fork-00000001' }));
  await assert.rejects(service.read(caller, { threadId: 'other-0000001' }), { code: 'CODEX_NOT_ATTACHED' });
});
test('canonical islands define order, ignore stale compact turns and reject incomplete indexes', () => {
  const old={turnId:'old-turn',status:'running',items:[]},current={turnId:'new-turn',status:'completed',items:[{type:'agentMessage',id:'final',text:'当前答复'}]};
  const state={turns:[old],turnHistory:{kind:'canonical',history:{entitiesByKey:{old,current,orphan:{turnId:'orphan',status:'running',items:[]}},islands:[{entries:[{value:'old'},{value:'current'}]}]}}};
  assert.deepEqual(turnsOf(state).map(t=>t.id),['old-turn','new-turn']);assert.equal(messagesOf(state).at(-1).text,'当前答复');assert.equal(activeTurn(state),null);
  state.turnHistory.history.islands[0].entries.push({value:'missing'});assert.throws(()=>activeTurn(state),{code:'CODEX_HISTORY_INCOMPLETE'});
});

test('owner discovery retries a transient native miss but preserves protocol rejections',async()=>{
 const ipc=new DesktopIPC('fixture');ipc.connect=async()=>{};let calls=0;
 ipc.request=async method=>{assert.equal(method,'thread-owner-discovery');if(++calls===1)throw Object.assign(Error('no-client-found'),{code:'CODEX_REJECTED'});return{handledByClientId:'desktop-fixture'};};
 assert.equal(await ipc.owner('thread-fixture',{waitMs:1000}),'desktop-fixture');assert.equal(calls,2);
 calls=0;ipc.request=async()=>{calls++;throw Object.assign(Error('unsupported-version'),{code:'CODEX_REJECTED'});};
 await assert.rejects(ipc.owner('thread-fixture',{waitMs:1000}),{code:'CODEX_REJECTED',message:'unsupported-version'});assert.equal(calls,1);
});


test('Desktop project resolution matches canonical roots, pages safely and refuses ambiguous or absent membership',async t=>{
  const root=await fixture(t),calls=[];
  const server={async call(method,input){calls.push({method,input});return input.cursor?{data:[{id:'ksf-project',name:'ksf',roots:[{path:root}]}],nextCursor:null}:{data:[{id:'other',roots:[{path:root+'/other'}]}],nextCursor:'second'};}};
  assert.equal((await desktopProjectForRoot(server,root)).id,'ksf-project');assert.equal(calls[1].input.cursor,'second');
  await assert.rejects(desktopProjectForRoot({call:async()=>({data:[]})},root),{code:'CODEX_PROJECT_REQUIRED'});
  await assert.rejects(desktopProjectForRoot({call:async()=>({data:[{id:'one',roots:[{path:root}]},{id:'two',roots:[{path:root}]}]})},root),{code:'CODEX_PROJECT_AMBIGUOUS'});
});

test('draft sends the native project identity and refuses to inject a message when acknowledgement differs',async t=>{
  const root=await fixture(t),executable=join(root,'mock-project-codex'),log=join(root,'project-requests');
  writeNodeExecutable(executable,`#!${process.execPath}\nconst fs=require('fs');require('readline').createInterface({input:process.stdin}).on('line',s=>{const m=JSON.parse(s);fs.appendFileSync(${JSON.stringify(log)},s+'\\n');if(m.id)process.stdout.write(JSON.stringify({id:m.id,result:m.method==='project/list'?{data:[{id:'ksf-project',roots:[{path:${JSON.stringify(root)}}]}]}:m.method==='thread/start'?{thread:{id:'thread-project-mismatch',projectId:'other-project'}}:{}})+'\\n')});`);
  await assert.rejects(createDraft({root,name:'test',executable}),{code:'CODEX_PROJECT_MISMATCH'});
  const requests=(await readFile(log,'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(requests.find(r=>r.method==='thread/start').params.projectId,'ksf-project');assert(!requests.some(r=>r.method==='thread/inject_items'));
});

test('native tool projection is bounded, keeps exact identities/outcomes and never exposes payloads or reasoning',()=>{
 const items=Array.from({length:220},(_,i)=>({id:'tool-'+i,type:'commandExecution',status:i===219?'failed':'completed',command:'PRIVATE_COMMAND',aggregatedOutput:'PRIVATE_OUTPUT',cwd:'/PRIVATE_PATH',arguments:{token:'PRIVATE_TOKEN'},exitCode:i===219?7:0,durationMs:2,startedAtMs:1000,completedAtMs:1002}));
 items.push({id:'mcp',type:'mcpToolCall',status:'completed',server:'local',tool:'inspect',arguments:{text:'PRIVATE_ARGS'},result:'PRIVATE_RESULT',error:'PRIVATE_ERROR'});
 items.push({id:'reasoning',type:'reasoning',summary:'PRIVATE_REASONING'});
 const state={turns:[{id:'old',status:'completed',items:[{id:'old-command',type:'commandExecution',status:'completed'}]},{id:'current',status:'completed',startedAtMs:1000,completedAtMs:1100,items}]};
 const projection=toolsOf(state);assert.equal(projection.total,221);assert.equal(projection.records.length,200);assert.equal(projection.truncated,true);assert.ok(projection.records.every(x=>x.turnId==='current'));
 const lastCommand=projection.records.find(x=>x.id==='tool-219');assert.equal(lastCommand.status,'failed');assert.equal(lastCommand.exitCode,7);assert.equal(lastCommand.nativeStatus,'failed');assert.equal(projection.records.at(-1).tool,'inspect');assert.doesNotMatch(JSON.stringify(projection),/PRIVATE_|old-command/);
 assert.equal(outcomeOf(state).status,'completed');assert.equal(toolsOf(state,{limit:0}).records.length,200);
 const nativeOnly=summaryOf({revision:'2',state:{...state,turns:[{id:'active',status:'inProgress',items:[]}],requests:[{id:1,method:'item/tool/requestUserInput',params:{turnId:'active',questions:[{id:'secret',question:'PRIVATE_QUESTION',isSecret:true}]}},{id:2,method:'item/commandExecution/requestApproval',params:{command:'PRIVATE_APPROVAL'}}]}});
 assert.equal(nativeOnly.privateInput,true);assert.equal(nativeOnly.approvals,true);assert.deepEqual(nativeOnly.questions,[]);assert.doesNotMatch(JSON.stringify(nativeOnly),/PRIVATE_/);
 const secretState={turns:[{id:'secret-turn',status:'completed',items:[{id:'secret-async',type:'agentMessage',delivery:'async',text:'PRIVATE_QUESTION_TEXT',questions:[{title:'PRIVATE_TITLE',isSecret:true}]}]}]};
 assert.equal(summaryOf({revision:'1',state:secretState}).privateInput,true);assert.deepEqual(messagesOf(secretState),[]);
 secretState.turns[0].items.push({id:'secret-reply',type:'userMessage',content:[{type:'text',text:'<send_user_message_question_reply>\n'+JSON.stringify([{questionItemId:JSON.stringify(['request_user_input_async','secret-async',0]),answer:'PRIVATE_ANSWER'}])+'\n</send_user_message_question_reply>'}]});
 assert.equal(summaryOf({revision:'2',state:secretState}).privateInput,false);assert.deepEqual(messagesOf(secretState),[]);
 const injected={turns:[{id:'active',status:'inProgress',items:[{id:'mcp-data',type:'mcpToolCall',status:'completed',result:{method:'item/tool/requestUserInput',id:'spoof',params:{turnId:'active',questions:[{id:'q',question:'untrusted tool data'}]},nested:{method:'item/commandExecution/requestApproval'}}}]}],requests:[]};
 const safe=summaryOf({revision:'1',state:injected});assert.deepEqual(safe.questions,[]);assert.equal(safe.approvals,false);assert.equal(safe.privateInput,false);assert.equal(safe.status,'running');
});

test('public Desktop read/events expose injected protocol fixture metadata changes without inventing message events',async t=>{
 const f=await serviceFixture(t),op=await f.service.create(caller,{operationId:'tools-operation-1',project:{name:'虚构项目',scope:'current'},text:'synthetic task'});await finish(f.service,op);
 const before=await f.service.read(caller,{threadId}),state=f.peer.states.get(threadId),turn=state.turns.at(-1);
 turn.items.push({id:'native-command',type:'commandExecution',status:'inProgress',command:'PRIVATE_COMMAND',aggregatedOutput:'PRIVATE_OUTPUT',startedAtMs:1000});f.peer.bump();await f.ipc.load(threadId,{fresh:true});
 const running=await f.service.events(caller,{threadId,afterVersion:before.version});assert.equal(running.changed,true);assert.equal(running.snapshot.tools.records[0].status,'running');assert.equal(running.snapshot.viewCapabilities.toolEvents,'native-metadata-v1');
 turn.items.at(-1).status='completed';turn.items.at(-1).exitCode=0;turn.items.at(-1).completedAtMs=1050;f.peer.bump();await f.ipc.load(threadId,{fresh:true});
 const done=await f.service.events(caller,{threadId,afterVersion:running.version});assert.equal(done.changed,true);assert.equal(done.snapshot.tools.records[0].id,'native-command');assert.equal(done.snapshot.tools.records[0].status,'completed');assert.equal(done.snapshot.tools.records[0].exitCode,0);assert.doesNotMatch(JSON.stringify(done),/PRIVATE_/);
});

test('public run controller reconciles a lost service receipt and confirms stop through the actual Desktop service with an injected IPC peer',async t=>{
 const f=await serviceFixture(t);f.peer.startStatus='inProgress';f.peer.autoSnapshots=true;let lose=true;
 const client=createCodexConversationsClient({services:{async call(_service,method,params){const result=await f.service[method](caller,...params);if(method==='create'&&lose){lose=false;throw Error('lost service receipt');}return result;}}});
 const controller=new RunController(createDesktopRunAdapter(client),{operationId:()=> 'public-stop-original'});
 await controller.submit({kind:'create',params:{operationId:'public-create-original',project:{name:'虚构项目',scope:'current'},text:'injected IPC fixture'}});
 assert.equal(controller.getSnapshot().submission.state,'unknown');
 const until=Date.now()+2000;while(controller.getSnapshot().observation?.phase!=='running'&&Date.now()<until){await controller.refresh();await delay(10);}
 assert.equal(f.peer.starts,1);assert.equal(controller.getSnapshot().identity.operationId,'public-create-original');assert.equal(controller.getSnapshot().observation.phase,'running');
 await controller.cancel();assert.notEqual(controller.getSnapshot().cancellation.state,'confirmed');
 while(controller.getSnapshot().cancellation.state!=='confirmed'&&Date.now()<until+1000){await controller.refresh();await delay(10);}
 assert.equal(controller.getSnapshot().cancellation.state,'confirmed');assert.equal(controller.getSnapshot().observation.phase,'cancelled');assert.equal(f.peer.requests.filter(x=>x.method==='thread-follower-interrupt-turn').length,1);
});

test('an async public answer can start a verified continuation through the actual Desktop service without rewriting the original operation',async t=>{
 const f=await serviceFixture(t);f.peer.autoSnapshots=true;
 const client=createCodexConversationsClient({services:{call:(_service,method,params)=>f.service[method](caller,...params)}}),controller=new RunController(createDesktopRunAdapter(client),{operationId:()=> 'async-public-answer'});
 await controller.submit({kind:'create',params:{operationId:'async-public-create',project:{name:'虚构项目',scope:'current'},text:'injected async fixture'}});
 const end=Date.now()+3000;while(controller.getSnapshot().observation?.phase!=='succeeded'&&Date.now()<end){await controller.refresh();await delay(10);}
 const original=controller.getSnapshot().identity,turn=f.peer.states.get(threadId).turns.at(-1);turn.items.push({id:'async-native-question',type:'agentMessage',delivery:'async',text:'question',questions:[{title:'Choose one',options:['one','two']}]});f.peer.bump();await f.ipc.load(threadId,{fresh:true});await controller.refresh();
 assert.equal(controller.getSnapshot().observation.phase,'waiting-input');const q=controller.getSnapshot().observation.questions[0];f.peer.startStatus='inProgress';await controller.answer({version:q.version,turnId:q.turnId,request:q.request,answers:{[q.questions[0].id]:'one'}});
 while(controller.getSnapshot().answer.state!=='confirmed'&&Date.now()<end){await controller.refresh();await delay(10);}await controller.refresh();
 assert.equal(controller.getSnapshot().answer.state,'confirmed');assert.equal(controller.getSnapshot().identity.operationId,original.operationId);assert.equal(controller.getSnapshot().identity.turnId,original.turnId);assert.equal(controller.getSnapshot().identity.continuation.operationId,'async-public-answer');assert.equal(controller.getSnapshot().observation.phase,'running');assert.equal(f.peer.starts,2);
});


test('a restricted public answer rechecks the owning app and current grant before any Native effect',async t=>{
 const {service,peer,root,ipc}=await serviceFixture(t);await finish(service,service.create(caller,createParams));
 const state=peer.states.get(threadId);state.requests=[{id:'restricted-question',method:'item/tool/requestUserInput',params:{turnId:state.turns.at(-1).id,questions:[{id:'q',question:'公开回答'}]}}];peer.bump();
 await ipc.load(threadId,{fresh:true});const current=await service.read(caller,{threadId}),request=current.questions[0].request;
 const owner={appId:'com.ksf.cooperation-center',version:'1.0.0'};
 const canonicalRoot=await realpath(root);createStore(root).change(s=>{s.bindings[threadId].appId=owner.appId;s.bindings[threadId].execution={workingDirectory:canonicalRoot,grant:{id:'missing-rule',revision:1,taskId:'12345678-1234-1234-1234-123456789abc',contentDigest:'a'.repeat(64),phase:'execute'}};});
 const effects=()=>peer.requests.filter(x=>['thread-follower-submit-user-input','thread-follower-steer-turn','thread-follower-start-turn'].includes(x.method)).length,before=effects();
 const params={threadId,version:current.version,request,answers:{q:['继续']}};
 const wrong=await finish(service,service.answer(caller,{...params,operationId:'answer-wrong-owner'}));assert.equal(wrong.status,'failed');assert.equal(wrong.error.code,'CODEX_EXECUTION_GRANT');
 const revoked=await finish(service,service.answer(owner,{...params,operationId:'answer-revoked-grant'}),owner);assert.equal(revoked.status,'failed');assert.equal(revoked.error.code,'AI_EXECUTION_GRANT_REVOKED');
 assert.equal(effects(),before);assert.equal(state.requests.length,1);
});
