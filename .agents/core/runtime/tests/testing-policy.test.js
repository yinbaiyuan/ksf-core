import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadCatalog,catalogPath} from '../src/testing/catalog.js';
import {createTestPlan,parseTestOptions} from '../src/testing/planner.js';
import {createVerificationPlan,validateVerificationPlan,planDigest} from '../src/testing/ci-plan.js';
import {validateLayeredCoverage,aggregateLayeredReports} from '../src/testing/ci-coverage.js';
import {sourceIdentity,validateProof} from '../src/testing/ci.js';
import {fixtureDigest} from '../src/testing/fixtures.js';
import {testEnvironment,executeTestPlan} from '../src/testing/runner.js';
import {scenarios,preservesAssertions,contractAssertions} from '../src/testing/coverage-audit.js';
import {fileURLToPath} from 'node:url';
import {gitBinary,nullDevice} from './helpers/platform.js';

function fixture(t) {
  const root=mkdtempSync(join(tmpdir(),'ksf-policy-')),runtime='.agents/core/runtime';
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  for(const dir of ['tests','src','testing'])mkdirSync(join(root,runtime,dir),{recursive:true});
  writeFileSync(join(root,'.agents/core/build.json'),JSON.stringify({runtime:{version:process.version.slice(1),packages:{fixture:'locked'}}}));
  writeFileSync(join(root,runtime,'src/logic.js'),'export const value=1;\n');
  writeFileSync(join(root,runtime,'src/adapter.js'),'export const native=true;\n');
  const item=(id,lane,kind,module)=>{
    const path=`${runtime}/tests/${id}.test.js`;writeFileSync(join(root,path),`import '../src/${module}.js';\n`);
    return {id,path,owner:'core',covers:['core'],suite:'quick',platforms:['darwin','win32','linux'],timeoutMs:1000,inputs:[runtime+'/src'],requirements:[],selectionInputs:[runtime+'/src/'+module+'.js'],verification:{lane,kind,reason:'Reviewed synthetic coverage policy.'}};
  };
  const catalog={schemaVersion:2,components:{core:{directory:runtime,testRoots:[runtime+'/tests']}},risks:[{paths:['.github',runtime+'/testing'],components:['core'],reason:'Policy changes require complete verification.'}],tests:[item('logic','shared','logic','logic'),item('native','native','contract','adapter')]};
  const save=()=>writeFileSync(join(root,catalogPath),JSON.stringify(catalog));save();
  const git=args=>{const r=spawnSync(gitBinary,['-C',root,...args],{encoding:'utf8',env:{...process.env,GIT_CONFIG_GLOBAL:nullDevice,GIT_CONFIG_SYSTEM:nullDevice}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
  git(['init','--template=']);git(['add','--','.agents']);git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','policy baseline']);
  const base=git(['rev-parse','HEAD']);
  return {root,runtime,catalog,save,base};
}
const makePlan=(f,full=true)=>createVerificationPlan(f.root,{full,base:f.base},sourceIdentity(f.root));
const reportsFor=(plan)=>plan.groups.map(g=>({schemaVersion:2,groupId:g.id,planDigest:plan.digest,profile:g.profile,
  platform:g.platform,architecture:g.architecture,nodeVersion:'v'+plan.runtime.version,sourceDigest:plan.sourceDigest,catalogDigest:plan.catalogDigest,runtime:plan.runtime,
  complete:true,status:'passed',suite:'full',scope:'files',component:null,commandExitCode:0,changedInputs:[],summary:{executed:g.files.length,reused:0,failed:0},
  selectedFiles:g.files,assignedFiles:g.files,results:g.files.map(path=>({path,status:'passed'}))}));

test('an additive platform wait must retain every original executable assertion',()=>{
  const root=fileURLToPath(new URL('../../../../',import.meta.url)),path='coverage-amendment.test.js';
  const original=scenarios(root,path,"test('crash',()=>{assert.equal(unknown,true);assert.notEqual(next,old);assert.equal(count,1);});")[0];
  const added=scenarios(root,path,"test('crash',async()=>{await stopped();assert.equal(unknown,true);assert.notEqual(next,old);assert.equal(count,1);assert.equal(state,'stopped');});")[0];
  assert.notEqual(original.hash,added.hash);assert.equal(preservesAssertions(original.assertions,added.assertions),true);
  assert.equal(preservesAssertions(original.assertions,added.assertions.slice(1)),false);
  assert.equal(preservesAssertions([original.assertions[0],original.assertions[0]],[original.assertions[0]]),false);
  assert.equal(preservesAssertions([],added.assertions),false);
});

test('reviewed contract changes name replacement assertions and retain every unaffected assertion',()=>{
  const root=fileURLToPath(new URL('../../../../',import.meta.url)),path='contract-update.test.js';
  const before=scenarios(root,path,"test('metadata',()=>{assert.deepEqual(info,{version:1});assert.equal(guard,true);});")[0];
  const after=scenarios(root,path,"test('metadata',()=>{assert.equal(info.version,1);assert.equal(info.sdk,2);assert.equal(guard,true);});")[0];
  const update={hash:after.hash,reason:'The metadata contract adds an SDK field.',originalAssertions:before.assertions,assertionUpdates:[{before:before.assertions[0],after:after.assertions.slice(0,2)}]};
  assert.equal(preservesAssertions(contractAssertions(update),after.assertions),true);
  assert.equal(preservesAssertions(contractAssertions(update),after.assertions.slice(0,2)),false);
  assert.equal(preservesAssertions(contractAssertions({...update,assertionUpdates:[]}),after.assertions),false);
  assert.throws(()=>contractAssertions({...update,assertionUpdates:[{before:before.assertions[0],after:[]}]}),{code:'TEST_COVERAGE_REDUCED'});
  assert.throws(()=>contractAssertions({...update,assertionUpdates:[{before:'0'.repeat(64),after:after.assertions}]}),{code:'TEST_COVERAGE_REDUCED'});
});

test('reviewed lanes reject missing declarations and a native label on pure logic',t=>{
  const f=fixture(t);assert.equal(loadCatalog(f.root).schemaVersion,2);
  delete f.catalog.tests[0].verification;f.save();assert.throws(()=>loadCatalog(f.root),{code:'TEST_CATALOG_INVALID'});
  f.catalog.tests[0].verification={lane:'native',kind:'logic',reason:'invalid'};f.save();assert.throws(()=>loadCatalog(f.root),{code:'TEST_CATALOG_INVALID'});
  f.catalog.tests[0].verification={lane:'shared',kind:'integration',reason:'missing boundary',nativeContracts:['absent']};f.save();assert.throws(()=>loadCatalog(f.root),{code:'TEST_CATALOG_INVALID'});
});
test('catalog rejects obligations without a CI target or declared native boundary',t=>{
  const f=fixture(t),item=f.catalog.tests[0];
  for(const platforms of [['win32'],['darwin','plan9'],['darwin','darwin']]){
    item.platforms=platforms;f.save();assert.throws(()=>loadCatalog(f.root),{code:'TEST_CATALOG_INVALID'});
  }
  item.platforms=['darwin'];item.verification={lane:'shared',kind:'integration',reason:'Missing required boundary'};f.save();
  assert.throws(()=>loadCatalog(f.root),{code:'TEST_CATALOG_INVALID'});
});
test('a misspelled risk component cannot silently suppress changed coverage',t=>{
  const f=fixture(t);f.catalog.risks[0].components=['cor'];f.save();
  assert.throws(()=>createTestPlan(f.root,parseTestOptions(['--suite','full','--changed']),{changes:{paths:[f.runtime+'/testing/policy.json']}}),{code:'TEST_CATALOG_INVALID'});
});
test('pure changes run once; native changes retain each target; unknown inputs fail closed',t=>{
  const f=fixture(t);
  writeFileSync(join(f.root,f.catalog.tests[0].path),"import '../src/logic.js'; // change\n");
  let plan=makePlan(f,false);assert.deepEqual(plan.groups.map(g=>g.profile),['shared']);assert.equal(plan.groups[0].platform,'darwin');
  writeFileSync(join(f.root,f.catalog.tests[1].path),"import '../src/adapter.js'; // change\n");
  plan=makePlan(f,false);assert.deepEqual(plan.groups.filter(g=>g.profile==='native').map(g=>g.target),['mac','win','linux22','linux24']);
  writeFileSync(join(f.root,f.runtime,'src/unmapped.js'),'// new owned implementation\n');
  plan=makePlan(f,false);assert.equal(plan.selectedIds.length,2);assert.ok(plan.reasons.some(r=>/Unmapped/.test(r.reason)));
  assert.equal(createTestPlan(f.root,parseTestOptions(['--suite','full','--profile','shared'])).tests.length,1);
  assert.throws(()=>parseTestOptions(['--profile','windows']),{code:'INVALID_ARGUMENTS'});
});
test('generated build outputs neither widen source selection nor invalidate its frozen plan',t=>{
  const f=fixture(t),manifest='.agents/core/manifest.yaml',dist=f.runtime+'/web/dist';
  writeFileSync(join(f.root,f.catalog.tests[0].path),"import '../src/logic.js'; // source change\n");
  mkdirSync(join(f.root,dist),{recursive:true});writeFileSync(join(f.root,manifest),'generated: first\n');writeFileSync(join(f.root,dist,'index-first.js'),'first build');
  const plan=makePlan(f,false);assert.deepEqual(plan.selectedIds,['logic']);
  assert.deepEqual(plan.changes,[f.catalog.tests[0].path]);
  writeFileSync(join(f.root,manifest),'generated: second\n');rmSync(join(f.root,dist,'index-first.js'));writeFileSync(join(f.root,dist,'index-second.js'),'second platform build');
  assert.deepEqual(validateVerificationPlan(f.root,plan,sourceIdentity(f.root)),plan);
  const generated=createTestPlan(f.root,parseTestOptions(['--suite','full','--changed']),{changes:{paths:[manifest,dist+'/index-second.js']}});
  assert.deepEqual(generated.tests,[]);
  writeFileSync(join(f.root,f.catalog.tests[1].path),"import '../src/adapter.js';const asset='../web/dist/index-second.js';\n");
  writeFileSync(join(f.root,dist,'index-second.js'),"import '../../src/logic.js';\n");
  const sourceOnly=createTestPlan(f.root,parseTestOptions(['--suite','full','--changed']),{changes:{paths:[f.runtime+'/src/logic.js']}});
  assert.deepEqual(sourceOnly.tests.map(t=>t.id),['logic']);
  writeFileSync(join(f.root,f.runtime,'web/dist-source.js'),'export const owned=true;\n');
  assert.deepEqual(createTestPlan(f.root,parseTestOptions(['--suite','full','--changed'])).requiredFullComponents,['core']);
});
test('selection follows current transitive imports and read-file literals without a stale generated graph',t=>{
  const f=fixture(t);writeFileSync(join(f.root,f.runtime,'src/logic.js'),'export const value=2;\n');
  assert.deepEqual(makePlan(f,false).selectedIds,['logic']);
  writeFileSync(join(f.root,f.runtime,'src/adapter.js'),"export {value} from './\\u006cogic.js';\n");
  const transitive=createTestPlan(f.root,parseTestOptions(['--suite','full','--changed']),{changes:{paths:[f.runtime+'/src/logic.js']}});
  assert.deepEqual(transitive.tests.map(t=>t.id),['logic','native']);
  f.catalog.tests[0].verification={lane:'shared',kind:'integration',reason:'Native boundary covered separately.',nativeContracts:['native']};f.save();
  const explicit=createTestPlan(f.root,parseTestOptions(['--suite','full','--changed']),{changes:{paths:[f.catalog.tests[0].path]}});
  assert.deepEqual(explicit.tests.map(t=>t.id),['logic','native']);
});
test('incidental path strings cannot hide an unmapped owned source change',t=>{
  const f=fixture(t),path=f.runtime+'/src/incidental.js';
  writeFileSync(join(f.root,path),'export const added=true;\n');
  writeFileSync(join(f.root,f.catalog.tests[0].path),"// '../src/incidental.js' is an example, not a registered dependency\n");
  const plan=createTestPlan(f.root,parseTestOptions(['--suite','full','--changed']),{changes:{paths:[path]}});
  assert.deepEqual(plan.tests.map(t=>t.id),['logic','native']);assert.deepEqual(plan.requiredFullComponents,['core']);
});
test('a dynamic SDK subpath widens consumers to the SDK boundary',t=>{
  const f=fixture(t),sdk='.agents/core/applications/sdk',path=sdk+'/src/new.ts';
  mkdirSync(join(f.root,sdk,'src'),{recursive:true});writeFileSync(join(f.root,sdk,'package.json'),JSON.stringify({exports:{'.':'./src/index.ts'}}));writeFileSync(join(f.root,path),'export const value=1;\n');
  f.catalog.tests[0].selectionInputs.push(sdk+'/src');f.save();
  writeFileSync(join(f.root,f.runtime,'src/adapter.js'),"export const load=name=>import('@ksf/sdk/'+name);\n");
  const plan=createTestPlan(f.root,parseTestOptions(['--suite','full','--changed']),{changes:{paths:[path]}});
  assert.deepEqual(plan.tests.map(t=>t.id),['logic','native']);assert.deepEqual(plan.requiredFullComponents,[]);
});
test('frozen plans reject file, base, catalog, source and target tampering',t=>{
  const f=fixture(t),plan=makePlan(f);
  assert.equal(validateVerificationPlan(f.root,plan,sourceIdentity(f.root)),plan);
  for(const mutate of [p=>p.groups.pop(),p=>p.groups[0].files.push('unregistered'),p=>p.groups[0].platform='win32',p=>p.runtime.version='0.0.0',p=>p.sourceDigest='old']){
    const changed=structuredClone(plan);mutate(changed);changed.digest=planDigest(changed);
    assert.throws(()=>validateVerificationPlan(f.root,changed,sourceIdentity(f.root)),{code:'TEST_CI_PLAN_INVALID'});
  }
  writeFileSync(join(f.root,f.runtime,'src/new.js'),'// new source');
  assert.throws(()=>validateVerificationPlan(f.root,plan,sourceIdentity(f.root)),{code:'TEST_CI_PLAN_INVALID'});
  const impact=makePlan(f,false);writeFileSync(join(f.root,f.runtime,'src/new.js'),'// changed again');
  assert.throws(()=>validateVerificationPlan(f.root,impact,sourceIdentity(f.root)),{code:'TEST_CI_PLAN_INVALID'});
});
test('layered proof requires every disjoint shared and real-native obligation',t=>{
  const f=fixture(t),plan=makePlan(f),identity=sourceIdentity(f.root),reports=reportsFor(plan);
  assert.equal(validateLayeredCoverage(f.root,reports,plan,identity).schemaVersion,2);
  for(const bad of [reports.slice(1),[...reports,reports[0]],reports.slice(0,-1)])assert.throws(()=>validateLayeredCoverage(f.root,bad,plan,identity),{code:'TEST_PROOF_INVALID'});
  for(const override of [{status:'cancelled'},{commandExitCode:1},{profile:'native'},{architecture:'x64'},{platform:'win32'},{planDigest:'stale'},{sourceDigest:'stale'},{catalogDigest:'stale'},{runtime:{}},{nodeVersion:'v0.0.0'},{changedInputs:['x']},{summary:{executed:1,reused:1}},{assignedFiles:[]},{selectedFiles:[]},{results:[{path:reports[0].assignedFiles[0],status:'reused'}]},{fixtureError:{code:'TEST_FIXTURE_CHANGED'}}]){
    assert.throws(()=>validateLayeredCoverage(f.root,[{...reports[0],...override},...reports.slice(1)],plan,identity),{code:'TEST_PROOF_INVALID'});
  }
  const proofPath=join(f.root,'proof.json'),summaryPath=join(f.root,'coverage.json');
  aggregateLayeredReports(f.root,reports,plan,identity,{proofPath,summaryPath});assert.ok(existsSync(proofPath));
  assert.throws(()=>aggregateLayeredReports(f.root,[],plan,identity,{proofPath,summaryPath}),{code:'TEST_PROOF_INVALID'});
  assert.equal(existsSync(proofPath),false);assert.ok(JSON.parse(readFileSync(summaryPath)).groups.every(g=>g.missing.length===1));
  const impact=makePlan(f,false);aggregateLayeredReports(f.root,reportsFor(impact),impact,sourceIdentity(f.root),{proofPath,summaryPath});assert.equal(existsSync(proofPath),false);
});
test('release accepts only schema-2 complete trusted evidence for the exact run and source',t=>{
  const f=fixture(t),plan=makePlan(f),proof=validateLayeredCoverage(f.root,reportsFor(plan),plan,sourceIdentity(f.root));
  const prior={...process.env};t.after(()=>{for(const key of ['GITHUB_REPOSITORY','GITHUB_SHA'])if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];});
  process.env.GITHUB_REPOSITORY='official/core';process.env.GITHUB_SHA='final-sha';
  Object.assign(proof,{repository:'official/core',commit:'final-sha',runId:'7',runAttempt:'2'});
  const run={id:7,run_attempt:2,conclusion:'success',head_sha:'final-sha',head_branch:'core-main',head_repository:{full_name:'official/core'},path:'.github/workflows/check.yml',event:'push'};
  assert.equal(validateProof(f.root,proof,run),true);
  for(const override of [{schemaVersion:1},{full:false},{runAttempt:'1'},{commit:'previous'},{groups:[]},{planDigest:'old'},{sourceDigest:'stale'}])assert.throws(()=>validateProof(f.root,{...proof,...override},run),{code:'TEST_PROOF_INVALID'});
  assert.throws(()=>validateProof(f.root,proof,{...run,event:'pull_request'}),{code:'TEST_PROOF_INVALID'});
});
test('seed copies keep files and Git histories independent and mutation changes their digest',t=>{
  const root=mkdtempSync(join(tmpdir(),'ksf-seed-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const seed=join(root,'seed');mkdirSync(join(seed,'.git/objects'),{recursive:true});writeFileSync(join(seed,'.git/objects/original'),'git object');writeFileSync(join(seed,'business.txt'),'original');
  const digest=fixtureDigest(seed);for(const name of ['one','two'])cpSync(seed,join(root,name),{recursive:true});
  writeFileSync(join(root,'one/business.txt'),'changed');writeFileSync(join(root,'one/.git/objects/original'),'new history');
  assert.equal(readFileSync(join(root,'two/business.txt'),'utf8'),'original');assert.equal(readFileSync(join(root,'two/.git/objects/original'),'utf8'),'git object');assert.equal(fixtureDigest(seed),digest);
  writeFileSync(join(seed,'business.txt'),'tampered');assert.notEqual(fixtureDigest(seed),digest);
  const inherited={KSF_TEST_DISTRIBUTION_SEEDS:'/previous-run',KSF_TEST_BASE:'outer-ci-commit',CI:'true'},child=testEnvironment(inherited);
  assert.equal(child.KSF_TEST_DISTRIBUTION_SEEDS,undefined);assert.equal(child.KSF_TEST_BASE,undefined);
  assert.equal(inherited.KSF_TEST_BASE,'outer-ci-commit');assert.equal(child.CI,'true');
});
test('failed seed preparation records incomplete scope and cleans its owned directory',async t=>{
  const f=fixture(t),helper=join(f.root,f.runtime,'tests/helpers');mkdirSync(helper);
  writeFileSync(join(helper,'prepare-distribution.mjs'),"throw Error('EXPECTED_SEED_FAILURE');\n");
  f.catalog.tests[0].fixtures=['distribution'];f.save();
  const {ok,result}=await executeTestPlan(f.root,createTestPlan(f.root,parseTestOptions(['--profile','shared'])),{progress(){}});
  assert.equal(ok,false);assert.equal(result.fixtureError.code,'TEST_FIXTURE_PREPARATION_FAILED');
  assert.equal(result.results[0].status,'not-executed');assert.equal(existsSync(result.temporaryDirectory),false);
  assert.equal(JSON.parse(readFileSync(result.reportPath)).complete,false);
});
test('cancelling seed preparation stops the owned builder before tests start',async t=>{
  const f=fixture(t),helper=join(f.root,f.runtime,'tests/helpers'),marker=join(f.root,'builder-started');mkdirSync(helper);
  writeFileSync(join(helper,'prepare-distribution.mjs'),`import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(marker)},'ready');setInterval(()=>{},1000);\n`);
  f.catalog.tests[0].fixtures=['distribution'];f.save();
  const pending=executeTestPlan(f.root,createTestPlan(f.root,parseTestOptions(['--profile','shared'])),{progress(){}});
  for(let n=0;n<200&&!existsSync(marker);n++)await new Promise(r=>setTimeout(r,10));
  assert.ok(existsSync(marker));process.emit('SIGTERM');const {ok,result}=await pending;
  assert.equal(ok,false);assert.equal(result.status,'cancelled');assert.equal(result.results[0].status,'not-executed');assert.equal(existsSync(result.temporaryDirectory),false);
});
