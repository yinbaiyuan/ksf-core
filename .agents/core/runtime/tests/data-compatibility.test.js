import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {inspectCoreDataCompatibility,assertCoreDataCompatibility} from '../src/data-compatibility.js';
import {serializeContributionPlan,contributionPlanMaxBytes} from '../src/distribution/contribution-plan.js';
const original=JSON.parse(await readFile(new URL('../../data-compatibility.json',import.meta.url),'utf8'));
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'ksf-compat-'));t.after(()=>rm(root,{recursive:true,force:true}));const candidate=join(root,'candidate');await mkdir(candidate);await writeFile(join(candidate,'build.json'),JSON.stringify({version:'0.3.0'}));await writeFile(join(candidate,'data-compatibility.json'),JSON.stringify(original));return{root,candidate,async write(path,value){const target=join(root,path);await mkdir(join(target,'..'),{recursive:true});await writeFile(target,typeof value==='string'?value:JSON.stringify(value));return target;}};}
test('Core compatibility preflight is read only and rejects unknown schema versions',async t=>{
 const f=await fixture(t),path=await f.write('.agents/user-data/settings.json',{schema_version:1,namespace:'settings',revision:1,values:{}}),before=await readFile(path,'utf8');
 const good=await inspectCoreDataCompatibility(f.root,f.candidate);assert.equal(good.compatible,true);assert.equal(good.filesChecked,1);assert.equal(await readFile(path,'utf8'),before);
 await f.write('.agents/user-data/settings.json',{schema_version:9});const newer=await readFile(path,'utf8');await assert.rejects(assertCoreDataCompatibility(f.root,f.candidate),{code:'CORE_DATA_INCOMPATIBLE'});assert.equal(await readFile(path,'utf8'),newer);
});
test('Core compatibility rejects a reader contract missing an existing format',async t=>{
 const f=await fixture(t);await f.write('.agents/user-data/applications/state.json',{schemaVersion:1,installed:{}});
 await writeFile(join(f.candidate,'data-compatibility.json'),JSON.stringify({...original,formats:original.formats.filter(row=>row.id!=='application-index')}));
 const result=await inspectCoreDataCompatibility(f.root,f.candidate);assert.equal(result.compatible,false);assert(result.errors.some(e=>e.format==='application-index'));
});
test('Core downgrade checks all installed and pending application requirements',async t=>{
 const f=await fixture(t),manifest={schemaVersion:1,sdkVersion:1,minCoreVersion:'0.4.0',dataStores:[],id:'com.example.future',name:'Future',description:'Synthetic',version:'1.0.0',permissions:[],window:{entry:'frontend/index.js'}};
 await f.write('.agents/user-data/applications/state.json',{schemaVersion:1,installed:{'com.example.future':{active:{manifest},enabled:false}}});
 const result=await inspectCoreDataCompatibility(f.root,f.candidate);assert.equal(result.compatible,false);assert(result.errors.some(e=>e.code==='APP_CORE_INCOMPATIBLE'&&e.appId==='com.example.future'));
});
test('Core preflight reports broken records without exposing or replacing contents',async t=>{
 const f=await fixture(t),path=await f.write('.agents/user-data/identity.json','{broken');const result=await inspectCoreDataCompatibility(f.root,f.candidate);assert.equal(result.compatible,false);assert.equal(await readFile(path,'utf8'),'{broken');assert(!JSON.stringify(result).includes('{broken'));
});
test('a target Core without its compatibility contract is rejected explicitly',async t=>{
 const f=await fixture(t);await rm(join(f.candidate,'data-compatibility.json'));await assert.rejects(inspectCoreDataCompatibility(f.root,f.candidate),{code:'CORE_DATA_CONTRACT_INVALID'});
});
test('unversioned Core sequence records use the declared fixed shape without changing business formats',async t=>{
 const f=await fixture(t),path=await f.write('.agents/user-data/communication/sequence.json',{value:12});assert.equal((await inspectCoreDataCompatibility(f.root,f.candidate)).compatible,true);await f.write('.agents/user-data/communication/sequence.json',{value:-1});assert.equal((await inspectCoreDataCompatibility(f.root,f.candidate)).compatible,false);assert.deepEqual(JSON.parse(await readFile(path)),{value:-1});
});
test('Core-owned Git ledgers retain their array shape and require a target reader',async t=>{
 const f=await fixture(t);await f.write('.agents/user-data/applications/data/git/operations.json',[{requestId:'synthetic',fingerprint:'fingerprint',operation:{id:'operation',status:'completed'}}]);assert.equal((await inspectCoreDataCompatibility(f.root,f.candidate)).compatible,true);await writeFile(join(f.candidate,'data-compatibility.json'),JSON.stringify({...original,formats:original.formats.filter(e=>e.id!=='git-operation-ledger')}));const check=await inspectCoreDataCompatibility(f.root,f.candidate);assert.equal(check.compatible,false);assert(check.errors.some(e=>e.format==='git-operation-ledger'));
});
test('the routing signing key is checked by format without exposing or rewriting its bytes',async t=>{
 const f=await fixture(t),path=await f.write('.agents/runtime-data/routing/v1/identity.key','k'.repeat(32));assert.equal((await inspectCoreDataCompatibility(f.root,f.candidate)).compatible,true);await f.write('.agents/runtime-data/routing/v1/identity.key','k'.repeat(31));const result=await inspectCoreDataCompatibility(f.root,f.candidate);assert.equal(result.compatible,false);assert.equal((await readFile(path)).length,31);assert(!JSON.stringify(result).includes('k'.repeat(31)));
});

test('configuration namespaces and application receipts preserve data and require matching readers',async t=>{
 const f=await fixture(t);
 for(const name of ['instance','desktop','appearance'])await f.write('.agents/user-data/'+name+'.json',{schema_version:1,namespace:name,revision:1,values:{synthetic:true}});
 const path=await f.write('.agents/runtime-data/configuration/apply/'+'a'.repeat(64)+'.json',{etag:'missing',application:{state:'applied'}}),before=await readFile(path);
 const result=await inspectCoreDataCompatibility(f.root,f.candidate);assert.equal(result.compatible,true);assert.equal(result.filesChecked,4);assert.deepEqual(await readFile(path),before);
 await writeFile(join(f.candidate,'data-compatibility.json'),JSON.stringify({...original,formats:original.formats.filter(row=>row.id!=='configuration-application')}));
 const missing=await inspectCoreDataCompatibility(f.root,f.candidate);assert.equal(missing.compatible,false);assert(missing.errors.some(row=>row.format==='configuration-application'));
 await f.write('.agents/runtime-data/configuration/apply/'+'a'.repeat(64)+'.json',{etag:'missing',application:null});
 await writeFile(join(f.candidate,'data-compatibility.json'),JSON.stringify(original));assert.equal((await inspectCoreDataCompatibility(f.root,f.candidate)).compatible,false);
});

test('desktop shortcut format blocks older Core readers without changing the persisted file',async t=>{
 const f=await fixture(t),path=await f.write('.agents/user-data/desktop.json',{schema_version:2,namespace:'desktop',revision:1,values:{}}),before=await readFile(path,'utf8');
 assert.equal((await inspectCoreDataCompatibility(f.root,f.candidate)).compatible,true);
 const older=structuredClone(original);older.formats.find(item=>item.id==='namespaces').versions=[1];await writeFile(join(f.candidate,'data-compatibility.json'),JSON.stringify(older));
 const result=await inspectCoreDataCompatibility(f.root,f.candidate);assert.equal(result.compatible,false);assert(result.errors.some(item=>item.format==='namespaces'&&item.actual===2));assert.equal(await readFile(path,'utf8'),before);
});

test('runtime, renamed and legacy Git locators use the same authoritative reader and preserve corrupt originals',async t=>{
 const f=await fixture(t);for(const location of ['.agents/runtime-data/applications/data/com.ksf.git','.agents/user-data/applications/data/git','.agents/user-data/applications/data/com.ksf.git']){const path=await f.write(location+'/operations.json',{unexpected:true}),before=await readFile(path);const result=await inspectCoreDataCompatibility(f.root,f.candidate);assert.equal(result.compatible,false);assert(result.errors.some(e=>e.format==='git-operation-ledger'));assert.deepEqual(await readFile(path),before);await rm(path);}
});

test('cooperation statement schema requires a compatible Core and never rewrites rules during preflight',async t=>{
 const f=await fixture(t),path=await f.write('.agents/runtime-data/ai/execution-grants/rules.json',{schemaVersion:2,revision:1,rules:[]}),before=await readFile(path,'utf8');assert.equal((await inspectCoreDataCompatibility(f.root,f.candidate)).compatible,true);
 const old=structuredClone(original);old.formats=old.formats.filter(row=>row.id!=='cooperation-execution-rules');await writeFile(join(f.candidate,'data-compatibility.json'),JSON.stringify(old));const result=await inspectCoreDataCompatibility(f.root,f.candidate);assert.equal(result.compatible,false);assert.ok(result.errors.some(e=>e.format==='cooperation-execution-rules'));assert.equal(await readFile(path,'utf8'),before);
});

test('large frozen contribution records retain their bytes and still require compatible readers',async t=>{
 const f=await fixture(t),name='.agents/runtime-data/contributions/11111111-1111-4111-8111-111111111111/plan.json';
 const path=await f.write(name,'{"schema_version":5}'+ ' '.repeat(65*1024*1024));
 const checksum=async()=>createHash('sha256').update(await readFile(path)).digest('hex'),before=await checksum();
 assert.equal((await inspectCoreDataCompatibility(f.root,f.candidate)).compatible,true);
 assert.equal(await checksum(),before);
 const missing=structuredClone(original);missing.formats=missing.formats.filter(row=>row.id!=='contribution-plans');
 await writeFile(join(f.candidate,'data-compatibility.json'),JSON.stringify(missing));
 const result=await inspectCoreDataCompatibility(f.root,f.candidate);assert.equal(result.compatible,false);assert(result.errors.some(e=>e.format==='contribution-plans'));
 assert.equal(await checksum(),before);
 await writeFile(join(f.candidate,'data-compatibility.json'),JSON.stringify(original));
 const handle=await open(path,'r+');await handle.write('{"schema_version":9}',0,'utf8');await handle.close();
 assert.equal((await inspectCoreDataCompatibility(f.root,f.candidate)).compatible,false);
 const restore=await open(path,'r+');await restore.write('{"schema_version":5}',0,'utf8');await restore.close();assert.equal(await checksum(),before);
});

test('contribution preflight keeps bounded JSON parsing and the ordinary record limit',async t=>{
 const f=await fixture(t),name='.agents/runtime-data/contributions/11111111-1111-4111-8111-111111111111/plan.json';
 const path=await f.write(name,'{"schema_version":5}');
 const oversized=await open(path,'r+');await oversized.truncate(128*1024*1024+1);await oversized.close();
 const tooLarge=await inspectCoreDataCompatibility(f.root,f.candidate);assert.equal(tooLarge.compatible,false);assert(tooLarge.errors.some(e=>e.format==='contribution-plans'&&e.code==='CORE_DATA_INVALID'));
 await f.write(name,'{"schema_version":5}'+ ' '.repeat(65*1024*1024)+'!');
 assert.equal((await inspectCoreDataCompatibility(f.root,f.candidate)).compatible,false);
 await rm(path);const ordinary=await f.write('.agents/user-data/settings.json','{"schema_version":1}');
 const handle=await open(ordinary,'r+');await handle.truncate(64*1024*1024+1);await handle.close();
 const regular=await inspectCoreDataCompatibility(f.root,f.candidate);assert.equal(regular.compatible,false);assert(regular.errors.some(e=>e.path==='.agents/user-data/settings.json'&&e.code==='CORE_DATA_INVALID'));
});

test('new contribution plans are bounded by encoded UTF-8 bytes before persistence',()=>{
 const exact={padding:' '.repeat(contributionPlanMaxBytes-Buffer.byteLength('{\n  "padding": ""\n}\n'))};
 assert.equal(Buffer.byteLength(serializeContributionPlan(exact)),contributionPlanMaxBytes);
 exact.padding+='中';assert.throws(()=>serializeContributionPlan(exact),{code:'CONTRIBUTION_TOO_LARGE'});
});
