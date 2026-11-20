import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCoreHost} from '../src/services/core-host.js';
import {createWorkbenchHTTP} from '../src/services/workbench-http.js';
import {encodePackage,checksum} from '../src/applications/protocol.js';
import {fixture as governanceFixture} from './helpers/governance-fixture.js';
import {createWorkspaceFiles} from '../src/services/workspace-files.js';
import {createProjectContextFiles} from '../src/services/project-context-files.js';
import {createApplicationStorage} from '../src/services/application-storage.js';
import {createFileService} from '../src/services/files.js';
import {createCoordinator} from '../src/services/workbench-common.js';

test('HTTP bytes use an active app lease, raw upload/download and managed-store protection',async t=>{
 const root=await mkdtemp(join(tmpdir(),'ksf-file-http-')),store=join(root,'store');await mkdir(store);await mkdir(join(root,'项目'));
 const manifest={schemaVersion:1,sdkVersion:1,minCoreVersion:'0.5.3',id:'com.example.file-http',name:'Files HTTP',description:'Synthetic',version:'1.0.0',permissions:['filesystem'],dataStores:[{name:'state.json',scope:'user',schemaVersion:1,migrateFrom:[]}],backend:{runtime:'node',lifecycle:'on-demand',entry:'backend/index.mjs'}};
 const code=Buffer.from('export function activate(context){return {call(method,input){return context.services.call("files",method,[input])}}}'),bytes=encodePackage(manifest,{'backend/index.mjs':{content:code.toString('base64'),sha256:checksum(code),mode:420}}),entry={manifest,package:{url:'fixture.ksfapp',size:bytes.length,sha256:checksum(bytes)}};await writeFile(join(store,'fixture.ksfapp'),bytes);await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:[entry]}));
 const host=createCoreHost(root,{applications:{storeDirectory:store,defaultSource:null,coreVersion:'0.5.7'}}),http=createWorkbenchHTTP(root,{host});
 const server=createServer((request,response)=>{const url=new URL(request.url,'http://127.0.0.1');void http.handle(request,url,(status,body,type='application/json',extra={})=>{response.writeHead(status,{'Content-Type':type,...extra});response.end(body);},response).then(handled=>{if(!handled){response.statusCode=404;response.end();}});});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await http.close();await rm(root,{recursive:true,force:true});});
 await host.applications.install({sourceId:'ksf-apps',appId:manifest.id,version:manifest.version,digest:entry.package.sha256,trusted:true});const lease=await host.applications.launch(manifest.id,entry.package.sha256,{kind:'service'}),session=(await(await fetch(origin+'/api/workbench/session')).json()).data;
 const ref={scope:'workspace',path:'项目/附件.pdf'},body=Buffer.from([0,255,80,68,70]),query=new URLSearchParams({instanceId:lease.id,ref:JSON.stringify(ref),operationId:'http_upload_probe'}),headers={Origin:origin,'X-KSF-Token':session.token,'Content-Type':'application/octet-stream','X-KSF-SHA256':checksum(body)};
 let response=await fetch(origin+'/api/files/content?'+query,{method:'POST',headers,body});assert.equal(response.status,200,await response.clone().text());const saved=(await response.json()).data;assert.equal(saved.size,body.length);
 response=await fetch(origin+'/api/files/content?'+query);assert.equal(response.status,200);assert.equal(response.headers.get('x-ksf-file-version'),saved.version);assert.deepEqual(Buffer.from(await response.arrayBuffer()),body);assert.match(response.headers.get('content-disposition'),/^attachment/);
 const backend=await host.applications.call(lease.id,'read',ref);assert.deepEqual(backend.bytes,body);
 response=await fetch(origin+'/api/files/content?'+new URLSearchParams({instanceId:lease.id,ref:JSON.stringify({scope:'user',path:'state.json'})}),{method:'POST',headers,body});assert.equal((await response.json()).error.code,'APP_DATA_MANAGED');
 response=await fetch(origin+'/api/files/stat',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({instanceId:'forged',input:ref})});assert.equal(response.status,410);
 await host.applications.release(lease.id);response=await fetch(origin+'/api/files/content?'+query);assert.equal(response.status,410);
});

test('generic project attachment operations preserve governance and registered-evidence guards',async t=>{
 const f=governanceFixture(t);assert.deepEqual(f.initialize().errors,[]);const coordinator=createCoordinator(),workspace=createWorkspaceFiles(f.root,coordinator),storage=createApplicationStorage(f.root,{locks:coordinator}),contexts=createProjectContextFiles(workspace,storage),files=createFileService(f.root,{workspace,coordinator,guard:input=>contexts.guardOperation(input)});t.after(async()=>{contexts.close();await files.close();});const who={appId:'com.example.guard',dataStores:[]},ref=path=>({scope:'workspace',path});
 const target=ref('项目/示例/附件.bin');await files.write(who,{ref:target,bytes:Buffer.from([0,255])});const original=await files.stat(who,target);await files.copy(who,{ref:target,destination:ref('项目/示例/副本.bin'),version:original.version});
 await files.mkdir(who,{ref:ref('资料/模板'),recursive:true});await files.writeText(who,{ref:ref('资料/模板/task.md'),text:'# 普通模板'});const template=await files.stat(who,ref('资料/模板'));await assert.rejects(files.copy(who,{ref:template.ref,destination:ref('项目/示例/模板'),version:template.version}),{code:'PROJECT_CONTEXT_READONLY'});assert.equal(await files.exists(who,ref('项目/示例/模板')),false);
 await assert.rejects(files.writeText(who,{ref:ref('项目/未建/project.md'),text:'# 原件'}),{code:'PROJECT_CONTEXT_READONLY'});await mkdir(join(f.root,'项目/旧项目'));await writeFile(join(f.root,'项目/旧项目/project.md'),'---\nname: 旧项目\n---\n# 旧项目');await assert.rejects(files.writeText(who,{ref:ref('项目/旧项目/附件.md'),text:'旧格式原件保持只读'}),{code:'PROJECT_CONTEXT_READONLY'});
 const managed=await files.stat(who,ref(f.pp));await assert.rejects(files.trash(who,{ref:managed.ref,version:managed.version}),{code:'PROJECT_CONTEXT_READONLY'});
 const text='evidence';await writeFile(join(f.root,'项目/示例/证据.txt'),text);const result=f.apply([f.change(f.tp,{verification:f.proof(f.task,'项目/示例/证据.txt',text)})]);assert.deepEqual(result.errors,[]);const evidence=await files.stat(who,ref('项目/示例/证据.txt'));await assert.rejects(files.trash(who,{ref:evidence.ref,version:evidence.version}),{code:'PROJECT_CONTEXT_REFERENCED'});assert.equal(await readFile(join(f.root,'项目/示例/证据.txt'),'utf8'),text);
});
