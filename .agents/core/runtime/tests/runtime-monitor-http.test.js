import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,writeFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createWorkbenchHTTP} from '../src/services/workbench-http.js';
import {encodePackage,checksum} from '../src/applications/protocol.js';
test('HTTP monitor requires session, live lease and explicit permissions without starting AI',async t=>{
  const root=await mkdtemp(join(tmpdir(),'ksf-monitor-http-')),store=join(root,'store');await mkdir(store);const entries=[];
  for(const [id,permissions] of [['com.example.reader',['runtime.read']],['com.example.viewer',[]]]){
    const manifest={schemaVersion:1,sdkVersion:1,minCoreVersion:'0.3.0',dataStores:[],id,name:id,version:'1.0.0',description:'fixture',window:{entry:'frontend/index.js'},permissions},content=Buffer.from('export function mount(){}'),bytes=encodePackage(manifest,{'frontend/index.js':{content:content.toString('base64'),sha256:checksum(content),mode:0o644}});
    const entry={manifest,package:{url:id+'.ksfapp',size:bytes.length,sha256:checksum(bytes)}};await writeFile(join(store,entry.package.url),bytes);entries.push(entry);
  }
  await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:entries}));
  const wb=createWorkbenchHTTP(root,{applications:{storeDirectory:store,defaultSource:null}}),server=createServer((req,res)=>{void wb.handle(req,new URL(req.url,'http://localhost'),(status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(body);});});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));await wb.close();await rm(root,{recursive:true,force:true});});
  const url='http://127.0.0.1:'+server.address().port,session=(await(await fetch(url+'/api/workbench/session')).json()).data;assert.ok(session.capabilities.includes('runtime-monitor-v1'));
  const post=input=>fetch(url+'/api/runtime/monitor',{method:'POST',headers:{origin:url,'x-ksf-token':session.token,'content-type':'application/json'},body:JSON.stringify(input)});
  assert.equal((await fetch(url+'/api/runtime/monitor')).status,405);assert.equal((await fetch(url+'/api/runtime/monitor',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,403);
  const leases=[];for(const e of entries){await wb.applications.install({trusted:true,sourceId:'builtin',appId:e.manifest.id,version:'1.0.0',digest:e.package.sha256});leases.push(await wb.applications.launch(e.manifest.id,e.package.sha256));}
  assert.equal((await post({operation:'snapshot',instanceId:leases[1].id})).status,403);
  const allowed=await post({operation:'snapshot',instanceId:leases[0].id});assert.equal(allowed.status,200);assert.equal((await allowed.json()).data.contractVersion,'runtime-monitor-v1');
  assert.equal((await post({operation:'act',instanceId:leases[0].id,kind:'service',id:'service',version:'v',action:'stop',operationId:'must-not-stop'})).status,403);
  await wb.applications.release(leases[0].id);assert.equal((await post({operation:'snapshot',instanceId:leases[0].id})).status,410);await assert.rejects(stat(join(root,'.agents/user-data/ai')),{code:'ENOENT'});
});
