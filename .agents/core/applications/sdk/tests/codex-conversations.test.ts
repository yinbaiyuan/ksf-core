import test from 'node:test';
import assert from 'node:assert/strict';
import { createCodexConversationsClient } from '../src/codex-conversations.ts';
test('conversation client exposes only named service methods and preserves typed numeric request refs',async()=>{
  const calls:unknown[]=[];
  const client=createCodexConversationsClient({services:{async call<T>(service:string,method:string,params:unknown[]=[]):Promise<T>{calls.push([service,method,params]);return {} as T;}}});
  await client.check();await client.create({operationId:'operation-one',project:{name:'虚构项目',scope:'current'},text:'原文\r\n'});
  await client.answer({operationId:'operation-two',threadId:'thread-one',version:'version-one',request:{type:'number',value:'9007199254740993'},answers:{q:['选择']}});
  assert.deepEqual(calls[0],['codex-conversations','check',[{}]]);
  assert.equal((calls[1] as any)[2][0].text,'原文\r\n');assert.equal((calls[2] as any)[2][0].request.value,'9007199254740993');
  assert.throws(()=>createCodexConversationsClient({}).check(),/SDK v2/);
});
