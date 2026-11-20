import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createFrontendQualifications,FRONTEND_QUALIFICATION_CHECKS} from '../src/web/frontend-qualifications.js';
import {createFrontendRuntime} from '../src/web/frontend-runtime.js';
import {verifyWebBuild} from '../src/web/assets.js';
import {uiRuntimeFixture} from './helpers/ui-runtime-fixture.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'ksf-ui-qualification-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const page=uiRuntimeFixture(t),assets=verifyWebBuild(page.web),qualifications=createFrontendQualifications(root);
  const directory=join(root,'.agents/runtime-data/acceptance');await mkdir(directory,{recursive:true});const path=join(directory,'fixture.json'),bytes=Buffer.from('{"scope":"test-only acceptance fixture","passed":true}');await writeFile(path,bytes);
  const input={schemaVersion:1,profile:'ksf-frontend-runtime-v1',releaseId:assets.uiRuntime.frontendReleaseId,buildDigest:assets.snapshotInfo.buildDigest,sourceDigest:assets.snapshotInfo.sourceDigest,platforms:[process.platform],reviewedAt:'2026-11-15T12:00:00.000Z',reviewedBy:'test fixture reviewer',checks:FRONTEND_QUALIFICATION_CHECKS.map(id=>({id,result:'passed',evidence:['fixture-report']})),evidence:[{id:'fixture-report',path:'.agents/runtime-data/acceptance/fixture.json',sha256:hash(bytes)}],limitations:['Synthetic contract test evidence; not a product release qualification.']};
  const runtime=createFrontendRuntime(root,{coreVersion:'0.6.0',webDirectory:page.web,bundledAssets:()=>verifyWebBuild(page.web),applications:()=>({withFrontendConsumers:action=>action([])})});
  await runtime.selected();const request=async()=>({operationId:randomUUID(),ifMatch:(await runtime.status()).etag});
  return {root,page,assets,input,path,qualifications,runtime,request};
}
test('product runtime consumes an independent complete record; boot or recording alone cannot designate LKG',async t=>{
  const f=await fixture(t),release=f.assets.uiRuntime.frontendReleaseId;
  assert.equal((await f.runtime.status()).lastKnownGood,null);
  await assert.rejects(f.runtime.qualify(release,{...await f.request(),qualificationId:'boot-succeeded'}),{code:'UI_QUALIFICATION_REQUIRED'});
  const record=await f.qualifications.record(f.input);assert.equal((await f.runtime.status()).lastKnownGood,null);
  const replay=await f.qualifications.record(f.input);assert.equal(replay.id,record.id);
  await f.runtime.qualify(release,{...await f.request(),qualificationId:record.id});assert.equal((await f.runtime.status()).lastKnownGood,release);
});
test('missing checks, failed checks and changed evidence cannot create a qualification record',async t=>{
  const f=await fixture(t);
  for(const input of [{...f.input,checks:f.input.checks.slice(1)},{...f.input,checks:f.input.checks.map((entry,index)=>index?entry:{...entry,result:'failed'})}])await assert.rejects(f.qualifications.record(input),{code:'UI_QUALIFICATION_REQUIRED'});
  await writeFile(f.path,'changed report');await assert.rejects(f.qualifications.record(f.input),{code:'UI_QUALIFICATION_EVIDENCE_CHANGED'});
  await assert.rejects(lstat(join(f.root,'.agents/user-data/ui-runtime/qualifications')),{code:'ENOENT'});
});
test('historical qualification profiles remain readable while new reviews use application and SDK boundaries',async t=>{
 const f=await fixture(t),ids=['integrity','shared-runtime','legacy-boundary','state-preservation','snapshot-rollback','recovery','csp-isolation','theme-motion'];
 const old={...f.input,profile:'ksf-ui-runtime-v1',checks:ids.map(id=>({id,result:'passed',evidence:['fixture-report']}))};
 const record=await f.qualifications.record(old);assert.equal(record.profile,'ksf-ui-runtime-v1');
 await assert.rejects(f.qualifications.record({...old,profile:'ksf-frontend-runtime-v1'}),{code:'UI_QUALIFICATION_REQUIRED'});
});
test('record identity includes full build/source and platform; an unrelated or damaged record leaves LKG unchanged',async t=>{
  const f=await fixture(t),release=f.input.releaseId,record=await f.qualifications.record({...f.input,buildDigest:'a'.repeat(64)});
  await assert.rejects(f.runtime.qualify(release,{...await f.request(),qualificationId:record.id}),{code:'UI_QUALIFICATION_IDENTITY'});assert.equal((await f.runtime.status()).lastKnownGood,null);
  const good=await f.qualifications.record(f.input),other=createFrontendQualifications(f.root,{platform:process.platform==='win32'?'darwin':'win32'});
  await assert.rejects(other.read(good.id,release),{code:'UI_QUALIFICATION_PLATFORM'});
  const path=join(f.root,'.agents/user-data/ui-runtime/qualifications',good.id+'.json'),value=JSON.parse(await readFile(path));value.schemaVersion=99;const damaged=JSON.stringify(value);await writeFile(path,damaged);
  await assert.rejects(f.runtime.qualify(release,{...await f.request(),qualificationId:good.id}),{code:'UI_QUALIFICATION_INVALID'});assert.equal(await readFile(path,'utf8'),damaged);assert.equal((await f.runtime.status()).lastKnownGood,null);
});
test('evidence traversal and symlink parents are rejected without reading or modifying outside files',async t=>{
  const f=await fixture(t),outside=await mkdtemp(join(tmpdir(),'ksf-ui-qualification-outside-'));t.after(()=>rm(outside,{recursive:true,force:true}));const path=join(outside,'report.json');await writeFile(path,'outside evidence');
  await assert.rejects(f.qualifications.record({...f.input,evidence:[{...f.input.evidence[0],path:'.agents/runtime-data/../secret'}]}),{code:'UI_QUALIFICATION_INVALID'});
  await symlink(outside,join(f.root,'.agents/runtime-data/linked'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(f.qualifications.record({...f.input,evidence:[{...f.input.evidence[0],path:'.agents/runtime-data/linked/report.json',sha256:hash('outside evidence')}]}),{code:'UI_QUALIFICATION_PATH_INVALID'});assert.equal(await readFile(path,'utf8'),'outside evidence');
});
