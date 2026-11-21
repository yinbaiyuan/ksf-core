import {pickerLocation,withinPickerRoot} from '../src/file-navigation.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackendFileClient,createFileClient,createFileTransport} from '../src/files.ts';
test('public headless file transport preserves host mutation identity without exposing UI methods',async()=>{
 const requests:any[]=[];const sdk:any={instanceId:'transport-only',resources:{prepare:async()=>{}},request:async(url:string,body:any)=>{requests.push({url,body});return {operationId:body.input.operationId};}};
 const files=createFileTransport(sdk);const receipt=await files.move({ref:{scope:'workspace',path:'项目/a.txt'},destination:{scope:'workspace',path:'项目/b.txt'},version:'v1',operationId:'stable-operation'});
 assert.equal(receipt.operationId,'stable-operation');assert.equal(requests[0].body.input.version,'v1');assert.equal('pickFile' in files,false);

});
test('backend file client uses the dedicated host service and preserves binary bytes',async()=>{
 const calls:any[]=[];const client=createBackendFileClient({services:{async call(service,method,params){calls.push({service,method,params});return params?.[0] as any;}}});const bytes=new Uint8Array([0,255]);await client.write({ref:{scope:'user',path:'images/a.bin'},bytes});assert.equal(calls[0].service,'files');assert.equal(calls[0].method,'write');assert.deepEqual(calls[0].params[0].bytes,bytes);assert.ok(calls[0].params[0].operationId);await client.stat({scope:'runtime',path:'cache'});assert.deepEqual(calls[1].params,[{scope:'runtime',path:'cache'}]);
});
test('frontend file upload sends a Blob with a digest and lease, not a JSON body',async()=>{
 const calls:any[]=[];const sdk:any={instanceId:'lease',getSession:async()=>({token:'session'}),request:async()=>({}),resources:{prepare:async()=>{}}};const client=createFileClient(sdk,async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({ok:true,data:{size:3}}));});await client.write({ref:{scope:'workspace',path:'项目/a.bin'},bytes:new Uint8Array([0,255,3])});assert.ok(calls[0].options.body instanceof Blob);assert.equal(calls[0].options.headers['Content-Type'],'application/octet-stream');assert.equal(calls[0].options.headers['X-KSF-SHA256'].length,64);assert.match(calls[0].url,/instanceId=lease/);
});
test('oversized file upload rejects before opening a session or transmitting bytes',async()=>{
 let sessions=0,requests=0;const sdk:any={getSession:async()=>{sessions++;return{};},resources:{prepare:async()=>{}}};const client=createFileClient(sdk,async()=>{requests++;return new Response();});class Huge extends Blob{get size(){return 128*1024*1024+1;}}await assert.rejects(client.upload({ref:{scope:'user',path:'large.bin'},blob:new Huge()}),{code:'FILE_TOO_LARGE'});assert.equal(sessions,0);assert.equal(requests,0);
});
test('file mutation requests preserve scope, source version and preparation ordering',async()=>{
 const calls:any[]=[];const sdk:any={instanceId:'lease',resources:{prepare:async(path:string)=>calls.push(['prepare',path])},request:async(path:string,input:unknown)=>{calls.push([path,input]);return{};}};const client=createFileClient(sdk);await client.move({ref:{scope:'workspace',path:'项目/a.bin'},destination:{scope:'workspace',path:'项目/b.bin'},version:'source-version'});assert.deepEqual(calls[0],['prepare','项目/a.bin']);assert.equal(calls[1][1].input.version,'source-version');assert.equal(calls[1][1].input.destination.path,'项目/b.bin');
});

test('file UI navigation stays inside an explicit caller range without pretending to grant permissions',()=>{
 assert.deepEqual(pickerLocation({rootPath:'资料/样例'}),{root:'资料/样例',initial:'资料/样例'});
 assert.deepEqual(pickerLocation({rootPath:'资料/样例',initialPath:'资料/样例/子目录'}),{root:'资料/样例',initial:'资料/样例/子目录'});
 for(const initialPath of ['其他','资料/样例之外','资料/样例/../其他','/资料/样例','资料\\样例'])assert.throws(()=>pickerLocation({rootPath:'资料/样例',initialPath}));
 assert.equal(withinPickerRoot('资料/样例之外','资料/样例'),false);assert.equal(withinPickerRoot('资料/样例/子目录','资料/样例'),true);
});
