import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {request} from 'node:https';
import {Readable} from 'node:stream';
import {createCommunicationService} from '../src/communication/service.js';
import {loadIdentity} from '../src/communication/identity.js';
const APP='example.messenger',CHANNEL='chat.v1';
async function fixture(t){
 const roots=await Promise.all([1,2].map(()=>mkdtemp(join(tmpdir(),'ksf-pairing-')))),callbacks=[],nodes=[];let time=Date.now();
 const apps={messageRoute:async(appId,channel)=>({enabled:appId===APP&&channel===CHANNEL,running:false}),deliverMessage:async()=>{}};
 for(let i=0;i<2;i++){nodes[i]=await createCommunicationService(roots[i],{applications:apps,now:()=>time,discoveryFactory:()=>({on(){},publish(){return {stop(){}};},find(_query,callback){callbacks[i]=callback;return {on(){},stop(){}};},destroy(callback){callback();}})});await nodes[i].configure({enabled:true,host:'127.0.0.1',port:0,discovery:true});}
 t.after(async()=>{await Promise.all(nodes.map(n=>n.close()));await Promise.all(roots.map(root=>rm(root,{recursive:true,force:true})));});
 const states=await Promise.all(nodes.map(n=>n.snapshot()));
 const discover=(i,j,nodeId=states[j].identity.nodeId)=>callbacks[i]({name:'test',addresses:['127.0.0.1'],port:states[j].listener.port,txt:{nodeId,pairingPort:String(states[j].pairingListener.port),name:'Test '+j}});
 discover(0,1);discover(1,0);
 const input={requestId:randomUUID(),nodeId:states[1].identity.nodeId,appId:APP,channel:CHANNEL};
 return {a:nodes[0],b:nodes[1],nodes,roots,states,input,discover,advance:ms=>{time+=ms;}};
}
async function raw(root,target,action,input){const identity=await loadIdentity(root);return new Promise((resolve,reject)=>{const body=Buffer.from(JSON.stringify(input)),req=request({host:'127.0.0.1',port:target.pairingListener.port,path:'/pairing/v1/'+action,method:'POST',key:identity.privateKey,cert:identity.certificate,rejectUnauthorized:false,headers:{'content-type':'application/json','content-length':body.length}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,...JSON.parse(Buffer.concat(chunks))}));});req.on('error',reject);req.end(body);});}
test('one request and one approval mutually pin identities and grant only the selected application channel',async t=>{
 const f=await fixture(t);await f.a.setDevice({name:'设备 A'});await f.b.setDevice({name:'设备 B'});const out=await f.a.pairing.request(f.input);assert.equal(out.status,'pending');assert.deepEqual((await f.a.store.config()).peers,{});assert.deepEqual((await f.b.store.config()).peers,{});
 const received=(await f.b.pairing.list(APP))[0];assert.equal(received.name,'设备 A');assert.equal(received.requestId,out.requestId);assert.equal(received.code,out.code);assert.equal((await f.b.pairing.list('other.app')).length,0);
 assert.equal((await f.b.pairing.answer({requestId:out.requestId,accept:true,appId:APP})).status,'accepted');
 for(const [node,other] of [[f.a,f.states[1]],[f.b,f.states[0]]]){const cfg=await node.store.config();assert.equal(cfg.peers[other.identity.nodeId].fingerprint,other.identity.fingerprint);assert.equal(cfg.peers[other.identity.nodeId].name,node===f.a?'设备 B':'设备 A');assert.deepEqual(cfg.grants,{[APP+'|'+CHANNEL]:{peers:[other.identity.nodeId],activation:true}});}
 const material=await f.a.registerMaterial({kind:'app',id:APP},Readable.from(['paired message'])),op=await f.a.send({kind:'app',id:APP},{operationId:randomUUID(),to:{nodeId:f.states[1].identity.nodeId,endpoint:{kind:'app',id:APP}},channel:CHANNEL,payloadPartId:'body',parts:[{partId:'body',materialId:material.materialId}]});
 // Wait for the sender's durable confirmation, which is distinct from peer
 // acceptance and can take longer than one second on a Windows CI filesystem.
 const deadline=performance.now()+10000;let state;do{state=await f.a.getOperation({kind:'app',id:APP},op.operationId);if(['delivered','failed'].includes(state.status))break;await new Promise(r=>setTimeout(r,25));}while(performance.now()<deadline);assert.equal(state.status,'delivered',JSON.stringify(state));
});
