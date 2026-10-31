import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { request } from 'node:http';
import { routingFixture } from './helpers/routing-fixture.js';
import { enableCapture, declareTask, syncTasks, taskHook } from '../src/services/tasks.js';
import { sessionKey } from '../src/routing/storage.js';
import { turnPath } from '../src/task-capture/storage.js';
import { startWebServer } from '../src/services/web.js';

const call = (server,path,headers={},method='GET') => new Promise((resolve,reject)=>{
  const req=request({hostname:server.host,port:server.port,path,method,headers},res=>{
    const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString(),headers:res.headers}));
  });req.on('error',reject);req.end();
});
function source(t, { withReport = true } = {}) {
  const f=routingFixture(t),home=join(f.root,'host'),path=join(home,'sessions/rollout-one.jsonl');
  mkdirSync(join(home,'sessions'),{recursive:true});const env={CODEX_THREAD_ID:'native-chat',CODEX_HOME:home};
  const append=row=>appendFileSync(path,JSON.stringify(row)+'\n');
  append({type:'session_meta',payload:{id:env.CODEX_THREAD_ID,cwd:f.root}});
  append({type:'event_msg',timestamp:'2026-01-02T00:00:00Z',payload:{type:'task_started',turn_id:'turn-one'}});
  append({type:'response_item',timestamp:'2026-01-02T00:00:01Z',payload:{type:'message',id:'user-one',role:'user',content:[{type:'input_text',text:'<script>alert(1)</script>用户原话'}]}});
  enableCapture({root:f.root,at:'2026-01-01T00:00:00Z'});
  if (withReport) {
    const receipt=declareTask({root:f.root,env,input:{turnId:'turn-one',eventId:'route',policy:'capture',reason:'明确选择此安排',report:f.report()}});
    append({type:'response_item',payload:{type:'function_call_output',call_id:'report',output:JSON.stringify(receipt)}});
  }
  append({type:'event_msg',timestamp:'2026-01-02T00:00:02Z',payload:{type:'task_complete',turn_id:'turn-one'}});
  const taskId=sessionKey(f.root,{host:'codex',sessionId:env.CODEX_THREAD_ID});
  return {...f,home,path,env,append,taskId};
}
test('task HTTP queries paginate summaries, lazily read body, recover after restart and enforce local boundaries',async t=>{
  let server;
  t.after(() => server?.close());

  const f=source(t);await syncTasks({root:f.root,env:f.env});
  server=await startWebServer({root:f.root,port:0,capture:false});
  const list=JSON.parse((await call(server,'/api/tasks')).body);assert.equal(list.data.total,1);
  const taskPath=`/api/tasks/${f.taskId}`,turn=taskPath+'/turns/turn-one';
  const detail=JSON.parse((await call(server,taskPath)).body);assert.equal(detail.data.turns[0].messages,undefined);
  const body=JSON.parse((await call(server,turn)).body);assert.equal(body.data.turn.messages[0].content[0].text,'<script>alert(1)</script>用户原话');
  assert.equal((await call(server,turn,{},'HEAD')).body,'');
  for(const query of ['limit=0','offset=-1','limit=1&limit=2'])assert.equal((await call(server,'/api/tasks?'+query)).status,400);
  for(const path of [taskPath,turn]) {
    assert.equal((await call(server,path,{Host:'evil.example'})).status,403);
    assert.equal((await call(server,path,{Origin:'https://evil.example'})).status,403);
    assert.equal((await call(server,path,{},'POST')).status,405);
  }
  assert.equal((await call(server,'/api/tasks/'+f.taskId+'/turns/../../USER.md')).status,404);
  assert.equal((await call(server,taskPath+'/turns/missing')).status,404);
  const bytes=readFileSync(join(f.root,turnPath(f.taskId,'turn-one')));
  await server.close();server=await startWebServer({root:f.root,port:0,capture:false});
  assert.equal(JSON.parse((await call(server,'/api/tasks')).body).data.total,1);
  assert.deepEqual(readFileSync(join(f.root,turnPath(f.taskId,'turn-one'))),bytes);
  writeFileSync(join(f.root,turnPath(f.taskId,'turn-one')),'{"protocol":"future"}');
  assert.equal((await call(server,turn)).status,500);
  assert.equal(JSON.parse((await call(server,'/api/tasks')).body).ok,false);
});
test('Web automatically exposes input and final answer for a turn without any Agent declaration or route', async t => {
  let server;
  t.after(() => server?.close());

  const f = source(t, { withReport: false });
  f.append({ type: 'response_item', timestamp: '2026-01-02T00:00:03Z', payload: { type: 'message', id: 'answer', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: '没有路由也有最终答复' }] } });
  server = await startWebServer({ root: f.root, port: 0, captureEnv: f.env });
  const path = `/api/tasks/${f.taskId}/turns/turn-one`;
  let turn;
  // Startup catch-up is intentionally asynchronous; wait for its observable result.
  for (let attempt = 0; attempt < 50; attempt++) {
    turn = JSON.parse((await call(server, path)).body).data?.turn;
    if (turn) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(turn, 'Web startup catch-up should publish the unreported turn');
  assert.equal(turn.status, 'completed'); assert.equal(turn.policy, 'capture'); assert.equal(turn.routes.length, 0); assert.equal(turn.declarations.length, 0);
  assert.deepEqual(turn.messages.map(m => [m.id, m.phase]), [['user-one','input'], ['answer','final_answer']]);
  assert.ok(turn.issues.some(i => i.code === 'TASK_ROUTE_UNREPORTED'));
  const list = JSON.parse((await call(server, '/api/tasks')).body).data.records[0];
  assert.equal(list.latestReported, null); assert.equal(list.lastTurn.messageCount, 2); assert.equal(list.lastTurn.route, null);
  await server.close(); server = await startWebServer({ root: f.root, port: 0, captureEnv: f.env });
  assert.deepEqual(JSON.parse((await call(server, path)).body).data.turn.messages, turn.messages);
});
test('Stop retries final flush and Web catch-up remains independent of host Hooks',async t=>{
  let server;
  t.after(() => server?.close());

  const f=source(t);
  const stopping=taskHook({root:f.root,env:f.env,input:{hook_event_name:'Stop',session_id:f.env.CODEX_THREAD_ID,turn_id:'turn-one',transcript_path:f.path}});
  setTimeout(()=>f.append({type:'response_item',timestamp:'2026-01-02T00:00:03Z',payload:{type:'message',id:'answer',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'完整答复'}]}}),80);
  assert.deepEqual(await stopping,{});
  server=await startWebServer({root:f.root,port:0,captureEnv:f.env});
  const path=`/api/tasks/${f.taskId}/turns/turn-one`;
  assert.equal(JSON.parse((await call(server,path)).body).data.turn.status,'completed');
  await server.close();
  // Without Web, the same CLI service records an additional native round.
  f.append({type:'event_msg',timestamp:'2026-01-03T00:00:00Z',payload:{type:'task_started',turn_id:'turn-two'}});
  const receipt=declareTask({root:f.root,env:f.env,input:{turnId:'turn-two',eventId:'policy2',policy:'capture',reason:'普通只读讨论',report:f.report({summary:'第二轮'})}});
  f.append({type:'response_item',payload:{type:'function_call_output',output:JSON.stringify(receipt)}});
  await syncTasks({root:f.root,env:f.env});
  server=await startWebServer({root:f.root,port:0,captureEnv:f.env});
  assert.equal(JSON.parse((await call(server,'/api/tasks')).body).data.records[0].turnCount,2);
});

test('task HTTP filters before pagination and route-only reads omit conversation bodies', async t => {
  let server;
  t.after(() => server?.close());

  const f = source(t); await syncTasks({ root: f.root, env: f.env });
  server = await startWebServer({ root: f.root, port: 0, capture: false });
  const result = JSON.parse((await call(server, '/api/tasks?project=state%3Anone&limit=1')).body).data;
  assert.equal(result.total, 1); assert.equal(result.records[0].latestReported.turnId, 'turn-one');
  assert.equal(JSON.parse((await call(server, '/api/tasks?q=missing')).body).data.total, 0);
  const route = JSON.parse((await call(server, `/api/tasks/${f.taskId}/turns/turn-one?messages=0`)).body).data.turn;
  assert.equal(route.messages, undefined); assert.equal(route.routes.length, 1);
  assert.equal(JSON.parse((await call(server, `/api/tasks/${f.taskId}/turns/turn-one`)).body).data.turn.messages.length, 1);
  for (const query of ['q=a&q=b', 'project=a&project=b', 'q=' + 'a'.repeat(201), 'messages=2']) assert.equal((await call(server, '/api/tasks?' + query)).status, 400);
});

test('project catalog and contextual turn APIs expose historical membership and keep local access checks', async t => {
  let server;
  t.after(() => server?.close());

  const { taskProjectFixture } = await import('./helpers/task-project-fixture.js');
  const f = taskProjectFixture(t);server = await startWebServer({ root: f.root, port: 0, capture: false });
  const catalog = JSON.parse((await call(server, '/api/task-projects')).body).data;
  assert.equal(catalog.projects.find(p => p.key === f.key('A')).primaryTurnCount, 3);
  assert.equal(catalog.projects.some(p => p.key === f.key('C')), false);
  const referenceOnly = JSON.parse((await call(server, `/api/tasks?projectMatch=history&project=${encodeURIComponent(f.key('C'))}`)).body).data;
  assert.equal(referenceOnly.total, 0);
  const query = `project=${encodeURIComponent(f.key('A'))}`;
  const list = JSON.parse((await call(server, `/api/tasks?projectMatch=history&${query}&limit=1`)).body).data;
  assert.equal(list.total, 1); assert.equal(list.records[0].projectContext.latestTurnId, 'four');
  const detail = JSON.parse((await call(server, `/api/tasks/${f.taskId}?${query}&limit=2`)).body).data;
  assert.equal(detail.total, 8); assert.equal(detail.turns.length, 2); assert.equal(detail.projectContext.turnCount, 3);
  const turn = JSON.parse((await call(server, `/api/tasks/${f.taskId}/turns/four?${query}`)).body).data.turn;
  assert.equal(turn.projectRelation.kind, 'primary'); assert.equal(turn.projectHistory.switched, true);
  assert.equal(turn.routes[0].snapshot.references[0].name, f.projects.C.name);
  for (const path of ['/api/task-projects', `/api/tasks?projectMatch=history&${query}`]) {
    assert.equal((await call(server, path, { Host: 'evil.example' })).status, 403);
    assert.equal((await call(server, path, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await call(server, path, {}, 'POST')).status, 405);
  }
  for (const query of ['projectMatch=guess', 'projectMatch=history&projectMatch=latest']) assert.equal((await call(server, '/api/tasks?' + query)).status, 400);
  assert.equal((await call(server, `/api/tasks/${f.taskId}?project=a&project=b`)).status, 400);
});
