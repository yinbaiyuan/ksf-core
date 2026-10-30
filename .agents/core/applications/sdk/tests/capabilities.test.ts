import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapabilitiesClient} from '../src/capabilities.ts';
test('capability client forwards an explicit reference through the public read-only bridge',async()=>{
  const calls:unknown[]=[];const context={services:{async call<T>(...args:unknown[]):Promise<T>{calls.push(args);return {id:'competency.example.review',source:'user',user_revision:2} as T;}}};
  const value=await createCapabilitiesClient(context).read({ref:'competency.example.review',source:'effective'});
  assert.equal(value.user_revision,2);assert.deepEqual(calls,[['capabilities','read',[{ref:'competency.example.review',source:'effective'}]]]);
});
