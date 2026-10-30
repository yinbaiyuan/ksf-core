import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createCapabilities} from '../src/services/capabilities.js';
import {objectMutation} from '../src/services/objects.js';
import {createApplicationManager} from '../src/applications/manager.js';
import {checksum,encodePackage} from '../src/applications/protocol.js';
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'ksf-capability-'));t.after(()=>rm(root,{recursive:true,force:true}));
  for(const dir of ['.agents/core/abilities/cooperations','.agents/core/abilities/partners','.agents/core/abilities/data-packages','能力/协同','能力/搭档','能力/基本功','能力/数据包'])await mkdir(join(root,dir),{recursive:true});
  const dir=join(root,'.agents/core/abilities/competencies/review');await mkdir(dir,{recursive:true});
  await writeFile(join(root,'.agents/core/manifest.yaml'),'name: KSF\nversion: 0.0.1\n');
  await writeFile(join(dir,'competency.md'),'---\nid: competency.example.review\nname: Review\ndescription: Synthetic method\nversion: 0.1.0\nstatus: active\nreferences: []\n---\nOriginal method\n');
  return {root,service:createCapabilities(root)};
}
test('public capability read resolves effective definitions, user revisions and pinned sources without writing',async t=>{
  const f=await fixture(t),original=f.service.read({ref:'competency.example.review'});
  assert.equal(original.source,'system');assert.match(original.definition_digest,/^[a-f0-9]{64}$/);
  objectMutation({root:f.root,type:'competency',operation:'write',id:original.id,input:{body:'Derived method\n'}});
  const derived=f.service.read({ref:original.id});assert.equal(derived.source,'user');assert.equal(derived.user_revision,1);assert.equal(derived.body,'Derived method\n');assert.notEqual(derived.definition_digest,original.definition_digest);
  assert.equal(f.service.read({ref:original.id+'@0.1.0',source:'system'}).definition_digest,original.definition_digest);
  objectMutation({root:f.root,type:'competency',operation:'write',id:original.id,input:{body:'Revised method\n'}});
  assert.equal(f.service.read({ref:original.id}).user_revision,2);
});
test('capability read rejects paths, other object types, unknown input and broken definitions',async t=>{
  const f=await fixture(t);
  assert.throws(()=>f.service.read({ref:'../private'}),{code:'OBJECT_REFERENCE_INVALID'});
  assert.throws(()=>f.service.read({ref:'partner.example.review'}),{code:'OBJECT_REFERENCE_INVALID'});
  assert.throws(()=>f.service.read({ref:'competency.example.review',body:'overwrite'}),{code:'CAPABILITY_ARGUMENT'});
  await writeFile(join(f.root,'.agents/core/abilities/competencies/review/competency.md'),'invalid');
  assert.throws(()=>f.service.read({ref:'competency.example.review'}),{code:'CAPABILITY_UNAVAILABLE'});
});
test('application service bridge requires filesystem permission and exposes only read',async t=>{
  const f=await fixture(t),store=join(f.root,'store');await mkdir(store);
  const file=text=>{const bytes=Buffer.from(text);return{content:bytes.toString('base64'),sha256:checksum(bytes),mode:0o644};};
  const entries=[];
  for(const allowed of [false,true]){
    const manifest={schemaVersion:1,minCoreVersion:'0.3.0',dataStores:[],sdkVersion:1,id:'com.example.capability-'+allowed,name:'Fixture',description:'Read-only capability bridge',version:'0.1.0',backend:{runtime:'node',lifecycle:'on-demand',entry:'backend/index.mjs'},permissions:allowed?['filesystem']:[]};
    const bytes=encodePackage(manifest,{'backend/index.mjs':file("export function activate(ctx){return{call(method){return ctx.services.call('capabilities',method,[{ref:'competency.example.review'}])}}}")});
    const entry={manifest,package:{url:allowed+'.ksfapp',sha256:checksum(bytes),size:bytes.length}};entries.push(entry);await writeFile(join(store,entry.package.url),bytes);
  }
  await writeFile(join(store,'index.json'),JSON.stringify({protocol:'ksf-app-registry-v1',apps:entries}));
  const manager=createApplicationManager(f.root,{defaultSource:null,storeDirectory:store,services:{capabilities:f.service}});t.after(()=>manager.close());
  for(const [i,entry] of entries.entries()){
    await manager.install({trusted:true,sourceId:'builtin',appId:entry.manifest.id,version:'0.1.0',digest:entry.package.sha256});
    if(!i)await assert.rejects(manager.invoke(entry.manifest.id,'read'),{code:'APP_PERMISSION_REQUIRED'});
    else assert.equal((await manager.invoke(entry.manifest.id,'read')).metadata.name,'Review');
    await assert.rejects(manager.invoke(entry.manifest.id,'write'),{code:'APP_SERVICE_UNKNOWN'});
  }
});
