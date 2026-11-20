import test from 'node:test';import assert from 'node:assert/strict';
import {FileOperationState} from '../src/controllers/file-operation-state.ts';
test('file intents are serial and an uncertain outcome blocks new writes and closing',()=>{
 const state=new FileOperationState();assert.equal(state.begin(),true);assert.equal(state.begin(),false);assert.equal(state.canClose(),false);
 state.failed({operationId:'original-operation'});state.end();assert.equal(state.begin(),false);assert.equal(state.canClose(),false);assert.equal(state.getSnapshot().operationId,'original-operation');
});
test('only the original committed ledger receipt releases uncertainty; unrelated and partial facts do not',()=>{
 const state=new FileOperationState();state.begin();state.failed({operationId:'a'});state.end();assert.equal(state.beginReconcile(),'a');
 for(const receipt of [{operationId:'a',state:'prepared'},{operationId:'a',state:'unconfirmed'},{operationId:'b',state:'committed'},{state:'committed'}])assert.equal(state.observed('a',receipt),false);
 state.end();assert.equal(state.canClose(),false);assert.equal(state.beginReconcile(),'a');assert.equal(state.observed('a',{operationId:'a',state:'committed'}),true);state.end();assert.equal(state.canClose(),true);assert.equal(state.begin(),true);
});
test('a failed query retains the prior operation identity and a known pre-operation rejection need not invent an unknown outcome',()=>{
 const state=new FileOperationState();state.begin();state.failed(new Error('validation'));state.end();assert.equal(state.canClose(),true);
 state.begin();state.failed({operationId:'a'});state.end();state.beginReconcile();state.failed(new Error('offline'));state.end();assert.equal(state.getSnapshot().operationId,'a');assert.equal(state.begin(),false);
});
