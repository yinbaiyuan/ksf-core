import test from 'node:test';
import assert from 'node:assert/strict';
import {createPeerPairingClient} from '../src/communication.ts';
test('pairing client binds every consent to the frontend lease and preserves the request ID',async()=>{
 const calls:any[]=[],sdk:any={instanceId:'window-one',getSession:async()=>({token:'local-session'})};
 const client=createPeerPairingClient(sdk,async(url,options)=>{calls.push([url,options]);return new Response(JSON.stringify({ok:true,data:{requestId:'request-one',status:'pending'}}));});
 await client.request({requestId:'request-one',nodeId:'peer',channel:'chat.v1'});await client.answer('request-one',false);
 assert.match(calls[0][0],/pairing-request\?instanceId=window-one/);assert.equal(calls[0][1].headers['X-KSF-Token'],'local-session');assert.equal(JSON.parse(calls[0][1].body).requestId,'request-one');assert.deepEqual(JSON.parse(calls[1][1].body),{requestId:'request-one',accept:false});
});
test('an uncertain pairing response is reported and never silently replayed',async()=>{
 let calls=0;const client=createPeerPairingClient({instanceId:'one',getSession:async()=>({token:'session'})} as any,async()=>{calls++;return new Response(JSON.stringify({ok:false,error:{code:'COMM_PAIRING_TIMEOUT',message:'offline'}}),{status:504});});
 await assert.rejects(client.answer('request-one',true),{code:'COMM_PAIRING_TIMEOUT'});assert.equal(calls,1);
});
test('device name client uses the current window session and reports validation failures',async()=>{
 const {createDeviceNameClient}=await import('../src/communication.ts');let request:any;
 const client=createDeviceNameClient({instanceId:'name-window',getSession:async()=>({token:'session'})} as any,async(url,options)=>{request={url,options};return new Response(JSON.stringify({ok:true,data:{name:'超哥的 Mac',custom:true}}));});
 assert.equal((await client.set('超哥的 Mac')).name,'超哥的 Mac');assert.match(request.url,/device-name\?instanceId=name-window/);assert.equal(request.options.headers['X-KSF-Token'],'session');assert.deepEqual(JSON.parse(request.options.body),{name:'超哥的 Mac'});
 const rejected=createDeviceNameClient({instanceId:'one',getSession:async()=>({token:'session'})} as any,async()=>new Response(JSON.stringify({ok:false,error:{code:'COMM_DEVICE_NAME_INVALID',message:'invalid'}}),{status:400}));await assert.rejects(rejected.set(''),{code:'COMM_DEVICE_NAME_INVALID'});
});
