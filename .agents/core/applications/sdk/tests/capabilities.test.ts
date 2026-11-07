import test from 'node:test';
import assert from 'node:assert/strict';
import {createCapabilitiesClient} from '../src/capabilities.ts';
import {createAssetsClient} from '../src/assets.ts';
import {createWorkContextClient} from '../src/context.ts';
test('capability client forwards an explicit reference through the public read-only bridge',async()=>{
  const calls:unknown[]=[];const context={services:{async call<T>(...args:unknown[]):Promise<T>{calls.push(args);return {id:'competency.example.review',source:'user',user_revision:2} as T;}}};
  const value=await createCapabilitiesClient(context).read({ref:'competency.example.review',source:'effective'});
  assert.equal(value.user_revision,2);assert.deepEqual(calls,[['capabilities','read',[{ref:'competency.example.review',source:'effective'}]]]);
});
test('work context keeps native identity and does not auto-confirm received bodies',async()=>{
 const calls:unknown[]=[];const delivery={bindingEtag:'v',cacheEtag:'c',generation:'g',manifestDigest:'m',baseOnly:false,extras:[]};
 const context={services:{async call<T>(...args:unknown[]):Promise<T>{calls.push(args);return {bodies:[{object:{body:'FULL_WORK_BODY'}}],delivery} as T;}}};
 const identity={host:'codex',sessionId:'native-chat'},client=createWorkContextClient(context,identity);const p=await client.current();
 assert.equal(p.bodies?.[0].object?.body,'FULL_WORK_BODY');assert.equal(calls.length,1);await client.accept(p.delivery!);
 assert.deepEqual(calls,[['work-context','current',[{identity}]],['work-context','accept',[{delivery,identity}]]]);
});
test('capability and asset clients retain expanded main text returned by the host',async()=>{
  const expanded=[{reference:'+partner.example.child@0.1.0',object:{id:'partner.example.child',body:'CHILD_FULL_MAIN_TEXT',metadata:{references:['#competency.example.next@0.1.0']}}}];
  const definition={id:'competency.example.owner',body:'PARENT_MAIN_TEXT',expanded};
  const context={services:{async call<T>(service:string):Promise<T>{return (service==='capabilities'?definition:{data:{object:definition,references:[],expanded},errors:[]}) as T;}}};
  const competency=await createCapabilitiesClient(context).read({ref:definition.id});
  const child=competency.expanded?.[0];assert.ok(child&&child.kind!=='file');assert.equal(child.object.body,'CHILD_FULL_MAIN_TEXT');
  const asset=await createAssetsClient(context).readObject({type:'competency',ref:definition.id});
  const assetChild=asset.data.expanded?.[0];assert.ok(assetChild&&assetChild.kind!=='file');assert.equal(assetChild.object.body,'CHILD_FULL_MAIN_TEXT');
});

test('SDK retains file content and missing states alongside ability definitions',async()=>{
  const expanded=[{reference:'+/USER.md',kind:'file',file:{source:'instance',path:'USER.md',state:'present',sha256:'a'.repeat(64),content:'FULL_USER\n'}},{reference:'+/BOT.md',kind:'file',file:{source:'instance',path:'BOT.md',state:'missing',sha256:null,content:null}}];
  const context={services:{async call<T>(service:string):Promise<T>{return (service==='capabilities'?{id:'competency.example.persona',expanded}:{data:{object:{id:'partner.example.runtime'},references:[],expanded},errors:[]}) as T;}}};
  const definition=await createCapabilitiesClient(context).read({ref:'competency.example.persona'});const user=definition.expanded?.[0];assert.ok(user?.kind==='file');assert.equal(user.file.content,'FULL_USER\n');
  const result=await createAssetsClient(context).readObject({type:'partner',ref:'partner.example.runtime'});const bot=result.data.expanded?.[1];assert.ok(bot?.kind==='file');assert.equal(bot.file.state,'missing');assert.equal(bot.file.content,null);
});
