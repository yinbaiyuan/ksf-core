import assert from 'node:assert/strict';
import {test} from 'node:test';
import {tmpdir} from 'node:os';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {createWorkbenchTerminal} from '../src/services/workbench-terminal.js';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {runInNewContext} from 'node:vm';
import * as path from 'node:path';

test('ConPTY output EOF disposes its worker without needing a final data event',()=>{
  let disposals=0;
  class Socket extends EventEmitter{setEncoding(){}destroy(){this.destroyed=true;}}
  class Connection{onReady(){}dispose(){disposals++;}}
  const native={startProcess:()=>({fd:1,pty:2,conin:'synthetic-in',conout:'synthetic-out'}),connect:()=>({pid:123})};
  const modules={fs:{openSync:()=>1},os:{release:()=> '10.0.26100'},path,child_process:{},net:{Socket},'./windowsConoutConnection':{ConoutConnection:Connection},'./utils':{loadNativeModule:()=>({module:native})}};
  const exports={};
  runInNewContext(readFileSync(new URL('../native/node-pty/lib/windowsPtyAgent.js',import.meta.url),'utf8'),{exports,require:name=>{assert.ok(name in modules,`Unexpected pinned dependency: ${name}`);return modules[name];}});
  const agent=new exports.WindowsPtyAgent('cmd.exe',[],{},tmpdir(),80,24,false,true,true,false);
  assert.equal(disposals,0);assert.notEqual(agent.inSocket.destroyed,true);agent.outSocket.emit('close');assert.equal(disposals,1);assert.equal(agent.inSocket.destroyed,true);
  agent.outSocket.emit('close');assert.equal(disposals,1);
});

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
