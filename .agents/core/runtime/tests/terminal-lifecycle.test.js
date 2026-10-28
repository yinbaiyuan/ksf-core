import assert from 'node:assert/strict';
import {test} from 'node:test';
import {tmpdir} from 'node:os';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {createWorkbenchTerminal} from '../src/services/workbench-terminal.js';

test('terminal release waits for the owned PTY exit and deduplicates concurrent stops',async()=>{
  let exit,kills=0;
  const terminal={pid:123,onData(){},onExit(fn){exit=fn;},kill(){kills++;},write(){},resize(){}};
  const service=createWorkbenchTerminal(tmpdir(),{loadPTY:async()=>({spawn:()=>terminal})});
  const caller={runtimeId:'synthetic-runtime',instanceId:'synthetic-window'};
  const session=await service.create(caller,{cols:80,rows:24});
  let closed=false,allClosed=false;
  const closing=service.close(caller,{id:session.id});
  const releasing=service.release(caller).then(()=>{closed=true;});
  await nextTurn();
  const disposing=service.dispose().then(()=>{allClosed=true;});
  await nextTurn();assert.equal(kills,1);assert.equal(closed,false);assert.equal(allClosed,false);
  exit({exitCode:0});await Promise.all([closing,releasing,disposing]);
  assert.equal(closed,true);assert.equal(allClosed,true);
  await assert.rejects(service.create(caller,{cols:80,rows:24}),/已关闭/);
});
