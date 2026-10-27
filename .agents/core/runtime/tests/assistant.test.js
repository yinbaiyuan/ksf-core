import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, cpSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { taskTargetFixture } from './helpers/task-target-fixture.js';
import { queryAssistant, refreshAssistant } from '../src/services/assistant.js';
import { listTaskTargets, readTask } from '../src/services/tasks.js';
import { routeEvolution } from '../src/routing/route-evolution.js';
import { sessionKey } from '../src/routing/storage.js';
function snapshot(root) { return readdirSync(root,{recursive:true,withFileTypes:true}).filter(v=>v.isFile()).map(v=>{const p=join(v.parentPath,v.name);return [p,readFileSync(p).toString('base64')]}).sort(); }
test('Assistant uses exact workbench targets and exports no conversation or previews without writes', t=>{
 const f=taskTargetFixture(t), before=snapshot(f.root);
 const data=queryAssistant({root:f.root,input:{op:'overview',nativeThreads:[]}});
 assert.deepEqual(data.targets,listTaskTargets({root:f.root}).targets);
 const output=JSON.stringify(data);for(const key of ['"messages"','"preview"','第 1 轮用户要求','完成本轮核对'])assert.ok(!output.includes(key),key);
 assert.deepEqual(snapshot(f.root),before);
 const page=queryAssistant({root:f.root,input:{op:'chats',target:f.knowledgeKey,limit:1}});
 assert.equal(page.records.length,1);assert.equal(page.total,1);
});
test('Assistant selected turn uses shared semantic evolution, not status updates',t=>{
 const f=taskTargetFixture(t);const data=queryAssistant({root:f.root,input:{op:'route',taskId:f.taskId,turnId:'switch',target:f.knowledgeKey}});
 const original=readTask({root:f.root,taskId:f.taskId,turnId:'switch',includeMessages:false});
 assert.deepEqual(data.evolution,routeEvolution(original.turn.routes));assert.equal(data.evolution.length,3);
 assert.ok(!('messages' in data.turn));assert.ok(!('preview' in data.turn));
});
test('Assistant refresh never enables disabled capture',async t=>{const f=taskTargetFixture(t),before=snapshot(f.root);const data=await refreshAssistant({root:f.root});assert.equal(data.skipped,true);assert.deepEqual(snapshot(f.root),before)});
test('Assistant rejects unsupported queries and invalid identities',t=>{const f=taskTargetFixture(t);assert.throws(()=>queryAssistant({root:f.root,input:{op:'write'}}));assert.throws(()=>queryAssistant({root:f.root,input:{nativeThreads:['bad\nidentity']}}));});
test('native identity resolves exactly and includes a non-project stop in token attribution',t=>{
 const f=taskTargetFixture(t);
 // Synthetic fixture key is installed before resolving its synthetic host ID.
 const identityDirectory=join(f.root,'.agents/runtime-data/routing/v1');mkdirSync(identityDirectory,{recursive:true});writeFileSync(join(identityDirectory,'identity.key'),Buffer.alloc(32,7));
 const id=sessionKey(f.root,{host:'codex',sessionId:'native-fixture'});
 f.save('native',12,[f.snapshot(f.projectTarget('A')),f.snapshot(f.knowledge),f.snapshot(f.projectTarget('B'))],{id});
 const before=snapshot(f.root),data=queryAssistant({root:f.root,input:{op:'overview',nativeThreads:['native-fixture','unrelated']}});
 assert.equal(data.nativeThreads.length,1);assert.equal(data.nativeThreads[0].taskId,id);
 assert.deepEqual(data.nativeThreads[0].bindings.map(v=>v.projectCard),[f.snapshot(f.projectTarget('A')).ownership.target.path,'',f.snapshot(f.projectTarget('B')).ownership.target.path]);
 assert.deepEqual(snapshot(f.root),before);
});
test('missing identity keys keep readable history and the supported host-runtime entry exports no bodies',t=>{
 const f=taskTargetFixture(t), data=queryAssistant({root:f.root,input:{op:'overview',nativeThreads:['unmatched-native']}});
 assert.ok(data.records.length);assert.equal(data.nativeThreads.length,0);assert.ok(data.errors.some(e=>e.code==='ROUTE_KEY_INVALID'));
 const runtime=join(f.root,'.agents/core/runtime');mkdirSync(runtime,{recursive:true});
 cpSync(fileURLToPath(new URL('../src',import.meta.url)),join(runtime,'src'),{recursive:true});writeFileSync(join(runtime,'package.json'),'{"type":"module"}');
 const before=snapshot(f.root), result=spawnSync(process.execPath,[join(runtime,'src/assistant-entry.js'),'query','--from','-','--json'],{input:JSON.stringify({op:'route',taskId:f.taskId,turnId:'switch'}),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const response=JSON.parse(result.stdout);assert.equal(response.data.evolution.length,3);assert.ok(!result.stdout.includes('"messages"'));assert.deepEqual(snapshot(f.root),before);
});
