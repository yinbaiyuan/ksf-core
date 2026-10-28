import test from 'node:test';
import assert from 'node:assert/strict';
import {createAIClient} from '../../../applications/sdk/src/ai-tasks.ts';
test('AI SDK forwards arrays through the managed bridge and resumes polling from the last cursor',async()=>{
  const calls:any[]=[];
  const ai=createAIClient({services:{async call(service,method,params){calls.push({service,method,params});if(method==='events'){const seq=(params?.[1] as number)===0?2:3;return{events:[{seq,type:'state',status:seq===2?'running':'succeeded'}],afterSeq:seq,snapshot:{status:seq===2?'running':'succeeded'}} as any;}return{aiTaskId:'synthetic'} as any;}}});
  const batches=[];for await(const batch of ai.watch('synthetic',{intervalMs:250}))batches.push(batch);assert.equal(batches.length,2);assert.deepEqual(calls.map(v=>v.params),[['synthetic',0],['synthetic',2]]);assert.ok(calls.every(v=>v.service==='ai'));
});
test('stopping a UI subscription does not issue an AI cancellation',async()=>{
  const methods:string[]=[];const controller=new AbortController();const ai=createAIClient({services:{async call(_service,method){methods.push(method);return{events:[],afterSeq:1,snapshot:{status:'running'}} as any;}}});
  const iterator=ai.watch('synthetic',{signal:controller.signal});await iterator.next();controller.abort(new Error('stop-view'));await assert.rejects(iterator.next(),/stop-view/);assert.deepEqual(methods,['events']);
});
