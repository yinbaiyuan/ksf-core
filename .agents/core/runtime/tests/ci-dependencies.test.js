import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {selectPreparationGroups} from '../src/testing/preparation-groups.js';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import YAML from '../src/vendor/yaml/dist/index.js';
import {loadCatalog} from '../src/testing/catalog.js';
import {createVerificationPlan, targets,verificationTargets,runtimeOnlyNative,runtimeOnlyCore,runtimeOnlyTest} from '../src/testing/ci-plan.js';
import {sourceIdentity} from '../src/testing/ci.js';
import {repositoryExports} from '../src/distribution/repository-exports.js';

function repositoryWorkflows(t) {
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const directory = join(root, '.agents/core/distribution/repository/.github/workflows');
  return directory;
}

test('CI prepares locked toolchains once per platform and restores them before full shards', t => {
  const directory = repositoryWorkflows(t); if (!directory) return;
  const verification = YAML.parse(readFileSync(join(directory, 'verification.yml'), 'utf8'));
  const native = YAML.parse(readFileSync(join(directory, 'verification-platform.yml'), 'utf8'));
  const preparation=YAML.parse(readFileSync(join(directory,'verification-prepare.yml'),'utf8'));
  const setup = preparation.jobs.prepare.steps, full = native.jobs.tests.steps;
  const installer=setup.find(s=>s.name==='Install locked platform dependencies').run;
  for (const part of ['applications/sdk', 'applications/projects', 'runtime/web']) {
    assert.ok(installer.includes('npm --prefix .agents/core/'+part+' ci'));
  }
  assert.match(installer,/wait "\$ksf_pid" \|\| ksf_install_status=\$\?/);
  assert.match(installer,/exit "\$ksf_install_status"/);
  assert.ok(setup.findIndex(s => /npm run build/.test(s.run ?? '')) < setup.findIndex(s => /tar -cf -/.test(s.run ?? '')));
  assert.ok(!setup.some(s => /ci.js run/.test(s.run ?? '')));
  assert.ok(full.findIndex(s => /tar -xf -/.test(s.run ?? '')) < full.findIndex(s => /ci.js run-group/.test(s.run ?? '')));
  for(const step of [...setup.filter(s=>/^Freeze prepared /.test(s.name??'')),full.find(s=>s.name==='Restore platform toolchains')]){
    assert.match(step.run,/set -o pipefail/,'A failed archive producer or consumer must fail the job.');
    const branches=step.run.match(/if \[ "\$RUNNER_OS" = Windows \]; then\n([\s\S]+?)\n\s*else\n([\s\S]+?)\n\s*fi/);
    assert.ok(branches,'Windows retains the measured file transport; other hosts stream.');
    assert.match(branches[1],/prepared\.tar(?:\s|$)/);assert.doesNotMatch(branches[1],/\|/);
    assert.match(branches[2],/\|/);assert.doesNotMatch(branches[2],/prepared\.tar(?:\s|$)/,'Streaming hosts must not materialize an uncompressed intermediate archive.');
  }
  assert.ok(!full.some(s => /npm (?:test|ci)|release build|npm run build/.test(s.run ?? '')));
  for (const step of [...setup,...full]) assert.ok(!step.env?.NODE_OPTIONS);
  const check = YAML.parse(readFileSync(join(directory, 'check.yml'), 'utf8'));
  assert.equal(check.jobs.required.if, "always() && github.repository == 'yinbaiyuan/ksf-core'");assert.deepEqual(check.jobs.required.needs, ['reuse','verification']);
  assert.deepEqual(verification.jobs.coverage.needs, ['plan','platform','linux-core','full-shared-linux','full-mac-runtime','full-mac','full-win-runtime','full-win']);
  assert.ok(!check.on.pull_request.paths && !check.on.push.paths);
  for(const id of ['plan','coverage'])assert.equal(verification.jobs[id]['runs-on'],'ubuntu-24.04','Pure orchestration must not queue for a native Mac runner.');
  assert.equal(check.jobs.required['runs-on'],'ubuntu-24.04');
  for (const job of Object.values(verification.jobs)) for (const step of job.steps ?? []) {
    if (!step.uses?.startsWith('actions/upload-artifact@')) continue;
    assert.equal(step.with.overwrite,true,'A rerun must replace the group receipt, not conflict with its prior upload.');
    if (step.if === 'failure()') {
      assert.match(step.with.name,/github\.run_attempt/,'Preserve prior attempts in separate failure artifacts.');
      assert.ok(step.with.path.includes('*.report.json'),'Startup failures need their structured receipt too.');
      assert.ok(step.with.path.includes('.agents/runtime-data/tests/'));
    }
  }

});

test('failed shards upload structured outcomes and coverage diagnoses before gating release proof',t=>{
  const workflow=YAML.parse(readFileSync(join(repositoryWorkflows(t),'verification.yml'),'utf8'));
  const native=YAML.parse(readFileSync(join(repositoryWorkflows(t),'verification-platform.yml'),'utf8'));
  for(const [job,id] of [['tests','tests'],['linux-core','tests']]){
    const steps=(job==='tests'?native:workflow).jobs[job].steps,run=steps.find(s=>s.id===id);
    assert.match(run.run,/ci.js run-group /);assert.doesNotMatch(run.run,/stamp|\|\|\s*true/);
    const upload=steps.find(s=>s.with?.name?.startsWith('group-'));
    assert.match(upload.if,/always\(\)/);assert.match(upload.if,new RegExp('steps\\.'+id+'\\.outcome'));
  }
  const steps=workflow.jobs.coverage.steps,aggregate=steps.findIndex(s=>/ci.js aggregate/.test(s.run??'')),gate=steps.findIndex(s=>s.name==='Require every applicable job');
  assert.ok(aggregate>=0&&gate>aggregate);assert.equal(steps[gate].if,'always()');
  const diagnostic=steps.find(s=>s.with?.name?.startsWith('coverage-')),proof=steps.find(s=>s.with?.name?.startsWith('suite-proof-'));
  assert.equal(diagnostic.if,'always()');assert.equal(proof.if,"success() && needs.plan.outputs.full == 'true'");
  assert.equal(workflow.jobs.coverage.if,"always() && github.repository == 'yinbaiyuan/ksf-core'");
});
test('native matrix has unique artifacts and a complete disjoint partition of each platform',t=>{
  const directory=repositoryWorkflows(t),workflow=YAML.parse(readFileSync(join(directory,'verification.yml'),'utf8'));
  const native=YAML.parse(readFileSync(join(directory,'verification-platform.yml'),'utf8'));
  assert.equal(native.jobs.tests.strategy.matrix, '${{ fromJSON(inputs.groups) }}');
  assert.equal(workflow.jobs.platform.with.groups, '${{ matrix.groups }}');
  const root=fileURLToPath(new URL('../../../../',import.meta.url)),catalog=loadCatalog(root);
  const plan=createVerificationPlan(root,{full:true},sourceIdentity(root));
  assert.equal(new Set(plan.groups.map(g=>g.id)).size,plan.groups.length);
  for(const target of verificationTargets(true)){
    const groups=plan.groups.filter(g=>g.target===target.target),files=groups.flatMap(g=>g.files);
    const expected=catalog.tests.filter(t=>(target.profile==='all'||t.verification.lane===target.profile)&&t.platforms.includes(target.platform)&&!(t.verification.lane==='shared'&&target.platform==='darwin'&&t.platforms.includes('linux'))&&(target.platform==='linux'||(target.toolchains===false?runtimeOnlyTest(t):!runtimeOnlyTest(t)))).map(t=>t.path);
    assert.deepEqual([...files].sort(),expected.sort());assert.equal(new Set(files).size,files.length);
    assert.ok(groups.length<=target.limit);
  }
  const shared=plan.groups.flatMap(g=>g.files).filter(path=>catalog.tests.find(t=>t.path===path).verification.lane==='shared');
  assert.equal(shared.length,catalog.tests.filter(t=>t.verification.lane==='shared').length);
  assert.ok(plan.groups.filter(g=>g.platform==='win32').every(g=>g.profile==='native'));
  assert.ok(plan.groups.filter(g=>g.platform==='darwin').length<=5);

});

test('CI verifies the shipped runtime through a launcher without forging bootstrap proof', t => {
  const directory = repositoryWorkflows(t); if (!directory) return;
  let checks = 0;
  for (const name of readdirSync(directory).filter(name => /\.ya?ml$/.test(name))) {
    const workflow = YAML.parse(readFileSync(join(directory, name), 'utf8'));
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        if (!/runtime\s+verify\b/.test(step.run ?? '')) continue;
        checks++;
        const command = step.run.replaceAll('\\', '/');
        assert.doesNotMatch(command, /\bnode\s+.*cli\.js\s+runtime\s+verify\b/, `${name}/${jobName}: invoke the launcher for runtime verification`);
        assert.match(command, /\.agents\/ksf(?:\.ps1)?\s+runtime\s+verify\b/, `${name}/${jobName}: invoke a KSF launcher`);
        assert.doesNotMatch(command, /KSF_BOOTSTRAP_VERIFIED/, `${name}/${jobName}: the launcher must create bootstrap proof`);
      }
    }
  }
  assert.ok(checks > 0, 'Repository workflows must verify the shipped runtime.');
});

test('CI Node environment flags can start the bundled runtime before selecting tests', t => {
  const directory = repositoryWorkflows(t); if (!directory) return;
  let checked = 0;
  for (const name of readdirSync(directory).filter(name => /\.ya?ml$/.test(name))) {
    const workflow = YAML.parse(readFileSync(join(directory, name), 'utf8'));
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        const options = step.env?.NODE_OPTIONS ?? job.env?.NODE_OPTIONS;
        if (!options) continue;
        const resolved = options.replaceAll('${{ matrix.shard }}', '1/1');
        assert.doesNotMatch(resolved, /\$\{\{/, `${name}/${jobName}: supply a matrix example for new Node flags`);
        const result = spawnSync(process.execPath, ['--eval', ''], {
          env: {...process.env, NODE_OPTIONS: resolved}, encoding: 'utf8', timeout: 15000,
        });
        assert.equal(result.status, 0, `${name}/${jobName}/${step.name}: ${result.stderr || result.error?.message}`);
        checked++;
      }
    }
  }
  assert.equal(checked, 0, "Test selection must use explicit CLI flags, never NODE_OPTIONS.");
});

 test('Linux core CI uses native Ubuntu and the verified bundled runtime',()=>{
  const workflow=YAML.parse(readFileSync(join(repositoryWorkflows(),'verification.yml'),'utf8'));
  const linux=workflow.jobs['linux-core'];
  assert.deepEqual(targets.filter(t=>t.platform==='linux'&&t.profile==='native').map(t=>t.os),['ubuntu-22.04','ubuntu-24.04']);
  assert.equal(linux.strategy.matrix,'${{ fromJSON(needs.plan.outputs.linux) }}');
  assert.equal(linux['runs-on'],'${{ matrix.os }}');
  assert.ok(linux.steps.some(s=>/\.agents\/ksf runtime verify --json/.test(s.run??'')));
  assert.ok(linux.steps.some(s=>/ci.js run-group verification-plan.json/.test(s.run??'')));
  assert.ok(linux.steps.some(s=>/always\(\)/.test(s.if??'')&&s.with?.name==='group-${{ matrix.id }}'));

 });

test('native platforms start independently and complete-proof reuse retains a fail-closed required gate',()=>{
 const directory=repositoryWorkflows(),verification=YAML.parse(readFileSync(join(directory,'verification.yml'),'utf8'));
 const native=YAML.parse(readFileSync(join(directory,'verification-platform.yml'),'utf8'));
 assert.equal(verification.jobs.platform.needs,'plan');
 assert.equal(verification.jobs.platform.uses,'./.github/workflows/verification-platform.yml');
 assert.equal(native.jobs.tests.needs,'prepare');
 const preparation=YAML.parse(readFileSync(join(directory,'verification-prepare.yml'),'utf8'));assert.equal(preparation.jobs.prepare['runs-on'],'${{ inputs.os }}');assert.equal(native.jobs.prepare.uses,'./.github/workflows/verification-prepare.yml');
 const check=YAML.parse(readFileSync(join(directory,'check.yml'),'utf8'));
 assert.match(check.jobs.verification.with.full,/github.event_name != 'workflow_dispatch'/);
 assert.match(check.jobs.verification.if,/needs.reuse.outputs.valid != 'true'/);
 assert.match(check.jobs.required.steps[0].run,/REUSE_RESULT.*success.*REUSED.*true/);
 const proof=YAML.parse(readFileSync(join(directory,'proof.yml'),'utf8'));
 assert.equal(proof.jobs.proof['runs-on'],'ubuntu-24.04');
 assert.ok(proof.jobs.proof.steps.some(step=>/ci.js verify-proof/.test(step.run??'')));
 const release=YAML.parse(readFileSync(join(directory,'release.yml'),'utf8'));
 assert.equal(release.jobs.release['runs-on'],'ubuntu-24.04');
 assert.equal(release.jobs.prepare['runs-on'],'ubuntu-24.04');
});


test('native Linux obligations use bounded early groups without changing their host coverage',()=>{
 const root=fileURLToPath(new URL('../../../../',import.meta.url)),catalog=loadCatalog(root),plan=createVerificationPlan(root,{full:true},sourceIdentity(root));
 const expected=catalog.tests.filter(t=>t.verification.lane==='native'&&t.platforms.includes('linux')).map(t=>t.path).sort();
 for(const target of ['linux22','linux24']){
  const groups=plan.groups.filter(g=>g.target===target);assert.equal(groups.length,2);assert.ok(groups.every(g=>g.profile==='native'&&g.platform==='linux'&&g.architecture==='x64'&&g.estimatedSeconds<=180));
  assert.deepEqual(groups.flatMap(g=>g.files).sort(),expected);assert.ok(groups.every(g=>g.os===(target==='linux22'?'ubuntu-22.04':'ubuntu-24.04')));
 }
});

test('CI prepares immutable same-attempt fixtures alongside dependencies and transports them with toolchains',()=>{
 const native=YAML.parse(readFileSync(join(repositoryWorkflows(),'verification-prepare.yml'),'utf8'));
 const tests=YAML.parse(readFileSync(join(repositoryWorkflows(),'verification-platform.yml'),'utf8'));
 const install=native.jobs.prepare.steps.find(s=>s.name==='Install locked platform dependencies'),freeze=native.jobs.prepare.steps.find(s=>s.name==='Freeze prepared toolchains'),run=tests.jobs.tests.steps.find(s=>s.id==='tests');
 assert.match(install.run,/prepare-ci-fixtures.js.*ksf_fixtures_pid=\$!/);assert.match(install.run,/for ksf_pid in .*"\$ksf_fixtures_pid"/);
 const select=native.jobs.prepare.steps.find(s=>s.name==='Select exact preparation groups');assert.equal(select.env.KSF_PREPARATION_GROUPS,'${{ inputs.groups }}');assert.match(select.run,/ci.js prepare-groups/);assert.ok(!install.env?.KSF_CI_GROUPS);assert.match(freeze.run,/tar -cf -.*\.agents\/runtime-data\/ci-seeds/);
 assert.equal(run.env.KSF_TEST_CI_PREPARED_SEEDS,'.agents/runtime-data/ci-seeds');
});

test('runtime-only transaction groups keep every native file and preserve hosted worker limits',()=>{
 const root=fileURLToPath(new URL('../../../../',import.meta.url)),catalog=loadCatalog(root),plan=createVerificationPlan(root,{full:true},sourceIdentity(root));
 assert.equal(runtimeOnlyNative.size,32);
 for(const id of runtimeOnlyNative){const t=catalog.tests.find(t=>t.id===id);assert.ok(t,id);assert.equal(t.verification.lane,'native');assert.equal(t.isolation,'exclusive');assert.deepEqual(t.fixtures,['distribution']);assert.deepEqual(t.requirements,[]);}
 for(const platform of ['darwin','win32']){
  const groups=plan.groups.filter(g=>g.platform===platform),files=groups.flatMap(g=>g.files),expected=catalog.tests.filter(t=>t.platforms.includes(platform)&&!(platform==='darwin'&&t.verification.lane==='shared'&&t.platforms.includes('linux'))&&!(platform==='win32'&&t.verification.lane==='shared')).map(t=>t.path);
  assert.deepEqual([...files].sort(),expected.sort());assert.equal(new Set(files).size,files.length);assert.ok(groups.length<=(platform==='darwin'?5:12));
  for(const g of groups.filter(g=>g.toolchains===false)){assert.equal(g.profile,'native');assert.ok(g.files.every(path=>runtimeOnlyTest(catalog.tests.find(t=>t.path===path))));}
 }
 const wf=YAML.parse(readFileSync(join(repositoryWorkflows(),'verification-platform.yml'),'utf8')),preparation=YAML.parse(readFileSync(join(repositoryWorkflows(),'verification-prepare.yml'),'utf8')),prepare=preparation.jobs.prepare.steps;
 assert.equal(wf.on.workflow_call.inputs.toolchains.default,true);assert.equal(wf.jobs.tests.needs,'prepare');
 assert.equal(prepare.find(s=>s.name==='Install locked platform dependencies').if,'inputs.toolchains');
 assert.equal(prepare.find(s=>s.name==='Prepare runtime-only native fixtures').if,'${{ !inputs.toolchains }}');
 assert.doesNotMatch(prepare.find(s=>s.name==='Freeze prepared runtime fixtures').run,/node_modules|web\/dist/);
 assert.equal(wf.jobs.tests.steps.find(s=>s.name==='Restore declared local SDK links').if,'inputs.toolchains');
 assert.equal(wf.jobs.tests.steps.find(s=>s.uses?.startsWith('actions/checkout@')).with['fetch-depth'],'${{ inputs.full && 1 || 0 }}');
 const parent=YAML.parse(readFileSync(join(repositoryWorkflows(),'verification.yml'),'utf8'));assert.equal(parent.jobs.platform.with.toolchains,'${{ matrix.toolchains }}');assert.equal(parent.jobs.platform.with.full,"${{ needs.plan.outputs.full == 'true' }}");assert.equal(parent.jobs.plan.steps[0].with['fetch-depth'],0);
 const release=YAML.parse(readFileSync(join(repositoryWorkflows(),'release.yml'),'utf8')),install=release.jobs.prepare.steps.find(s=>s.name==='Install locked release dependencies');
 assert.match(install.run,/wait "\$ksf_pid" \|\| ksf_install_status=\$\?/);assert.match(install.run,/exit "\$ksf_install_status"/);assert.equal(release.jobs.prepare.steps.find(s=>s.uses?.startsWith('actions/upload-artifact@')).with['compression-level'],0);
});


test('qualified Core files share runtime workers without moving frontend or unqualified files',()=>{
 const root=fileURLToPath(new URL('../../../../',import.meta.url)),catalog=loadCatalog(root),plan=createVerificationPlan(root,{full:true},sourceIdentity(root));
 assert.equal(runtimeOnlyCore.size,82);
 for(const id of runtimeOnlyCore){
  const item=catalog.tests.find(t=>t.id===id);assert.ok(item,id);assert.equal(item.owner,'core');assert.equal(item.verification.lane,'native');assert.deepEqual(item.requirements,[]);
  assert.deepEqual(item.fixtures??[],id==='core:path-identity'?['distribution']:[]);
 }
 for(const id of ['core:application-open-ui','core:eval'])assert.equal(runtimeOnlyTest(catalog.tests.find(t=>t.id===id)),false);
 assert.equal(runtimeOnlyTest({id:'core:new-native-file',owner:'core',requirements:[]}),false);
 for(const [target,count] of [['mac-runtime',4],['mac',1],['win-runtime',10],['win',2]])assert.equal(plan.groups.filter(g=>g.target===target).length,count);
 assert.equal(plan.groups.length,24);assert.equal(plan.groups.reduce((sum,g)=>sum+g.files.length,0),549);
});


test('full platform preparation overlaps planning without cross-platform readiness barriers',()=>{
 const directory=repositoryWorkflows(),workflow=YAML.parse(readFileSync(join(directory,'verification.yml'),'utf8')),native=YAML.parse(readFileSync(join(directory,'verification-platform.yml'),'utf8'));
 const expected=[['shared-linux','Linux','ubuntu-24.04',true],['mac-runtime','macOS-runtime','xcode-27',false],['mac','macOS','xcode-27',true],['win-runtime','Windows-runtime','windows-2025',false],['win','Windows','windows-2025',true]];
 for(const [id,prepared,os,toolchains] of expected){
  const producer=workflow.jobs['prepare-'+id],consumer=workflow.jobs['full-'+id];
  assert.equal(producer.needs,undefined);assert.match(producer.if,/inputs.full/);assert.equal(producer.uses,'./.github/workflows/verification-prepare.yml');assert.deepEqual(producer.with,{os,prepared,toolchains,full:true});
  assert.deepEqual(consumer.needs,['plan','prepare-'+id]);assert.match(consumer.if,/needs.plan.outputs.has_native/);assert.equal(consumer.with.prepared_external,true);assert.equal(consumer.with.prepared,prepared);assert.equal(consumer.with.toolchains,toolchains);
  assert.ok(consumer.with.groups.includes("['"+prepared+"']"));assert.ok(workflow.jobs.coverage.needs.includes('full-'+id));
 }
 assert.match(workflow.jobs.platform.if,/!inputs.full/);assert.equal(native.on.workflow_call.inputs.prepared_external.default,false);
 assert.match(native.jobs.prepare.if,/!inputs.prepared_external/);assert.match(native.jobs.tests.if,/!cancelled\(\)/);assert.match(native.jobs.tests.if,/needs.prepare.result == 'success'/);
 const gate=workflow.jobs.coverage.steps.find(s=>s.name==='Require every applicable job');assert.equal(gate.if,'always()');assert.match(gate.run,/KSF_FULL/);
 for(const key of ['KSF_SHARED_LINUX_RESULT','KSF_MAC_RUNTIME_RESULT','KSF_MAC_RESULT','KSF_WIN_RUNTIME_RESULT','KSF_WIN_RESULT'])assert.ok(gate.run.includes('"$'+key+'"'));
 assert.equal(workflow.permissions.contents,'read');assert.equal(Object.keys(workflow.permissions).length,1);
 assert.deepEqual(targets.filter(t=>t.prepared).map(t=>[t.target,t.prepared,t.os,t.toolchains]),expected);
});


test('source-derived full preparation equals canonical groups and rejects wrong host or altered input',()=>{
 const root=fileURLToPath(new URL('../../../../',import.meta.url)),identity=sourceIdentity(root),plan=createVerificationPlan(root,{full:true},identity);
 for(const target of targets.filter(t=>t.prepared)){
  const host={platform:target.platform,architecture:target.architecture},input={prepared:target.prepared,os:target.os,toolchains:target.toolchains,full:true},expected={include:plan.groups.filter(g=>g.prepared===target.prepared)};
  assert.deepEqual(selectPreparationGroups(root,input,identity,host),expected);
  assert.deepEqual(selectPreparationGroups(root,{...input,groups:JSON.stringify(expected,null,2)},identity,host),expected);
  for(const changed of [{groups:'null'},{groups:'{'},{groups:'{"include":[]}'},{os:'other-host'},{toolchains:!target.toolchains},{full:false},{full:'true'}])assert.throws(()=>selectPreparationGroups(root,{...input,...changed},identity,host),{code:'TEST_CI_PREPARATION_INVALID'});
  assert.throws(()=>selectPreparationGroups(root,input,identity,{...host,architecture:'wrong'}),{code:'TEST_CI_PREPARATION_INVALID'});
  const altered=structuredClone(expected);altered.include[0].files.pop();assert.throws(()=>selectPreparationGroups(root,{...input,groups:JSON.stringify(altered)},identity,host),{code:'TEST_CI_PREPARATION_INVALID'});
 }
});

test('affected preparation retains explicit groups and refuses duplicate or cross-target files',()=>{
 const root=fileURLToPath(new URL('../../../../',import.meta.url)),identity=sourceIdentity(root),plan=createVerificationPlan(root,{full:true},identity),target=targets.find(t=>t.target==='mac-runtime'),host={platform:target.platform,architecture:target.architecture};
 const expected={include:plan.groups.filter(g=>g.prepared===target.prepared).slice(0,1)},input={prepared:target.prepared,os:target.os,toolchains:target.toolchains,full:false,groups:JSON.stringify(expected)};
 assert.deepEqual(selectPreparationGroups(root,input,identity,host),expected);
 for(const mutate of [v=>v.include.push(structuredClone(v.include[0])),v=>v.include[0].files.push(v.include[0].files[0]),v=>v.include[0].files.push(plan.groups.find(g=>g.target==='mac').files[0]),v=>v.include[0].architecture='x64',v=>v.include[0].profile='all',v=>v.include[0].id='wrong-1',v=>v.include[0].id='mac-runtime-5']){
  const changed=structuredClone(expected);mutate(changed);assert.throws(()=>selectPreparationGroups(root,{...input,groups:JSON.stringify(changed)},identity,host),{code:'TEST_CI_PREPARATION_INVALID'});
 }
});

test('the actual coverage gate rejects failed, cancelled, skipped and missing prerequisites',()=>{
 const workflow=YAML.parse(readFileSync(join(repositoryWorkflows(),'verification.yml'),'utf8'));
 const script=workflow.jobs.coverage.steps.find(s=>s.name==='Require every applicable job').run;
 const fullKeys=['KSF_SHARED_LINUX_RESULT','KSF_MAC_RUNTIME_RESULT','KSF_MAC_RESULT','KSF_WIN_RUNTIME_RESULT','KSF_WIN_RESULT'];
 const baseline={...process.env,KSF_FULL:'true',PLAN:'success',HAS_NATIVE:'true',HAS_LINUX:'true',LINUX:'success',PLATFORM:'skipped',...Object.fromEntries(fullKeys.map(k=>[k,'success']))};
 const run=env=>spawnSync('bash',['-e','-c',script],{env,encoding:'utf8',timeout:10000});
 assert.equal(run(baseline).status,0);
 for(const key of ['PLAN','LINUX',...fullKeys])for(const status of ['failure','cancelled','skipped',''])assert.notEqual(run({...baseline,[key]:status}).status,0,`${key}: ${status}`);
 const affected={...baseline,KSF_FULL:'false',PLATFORM:'success',...Object.fromEntries(fullKeys.map(k=>[k,'skipped']))};
 assert.equal(run(affected).status,0);
 for(const status of ['failure','cancelled','skipped',''])assert.notEqual(run({...affected,PLATFORM:status}).status,0);
 assert.equal(run({...affected,HAS_NATIVE:'false',PLATFORM:'skipped'}).status,0);
});

test('preparation CLI publishes only normalized groups after validating real-host inputs',t=>{
 const root=fileURLToPath(new URL('../../../../',import.meta.url)),folder=mkdtempSync(join(tmpdir(),'ksf-preparation-env-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
 const target=targets.find(t=>t.prepared&&t.platform===process.platform&&t.architecture===process.arch);if(!target)return t.skip('No official preparation target for this host.');
 const output=join(folder,'environment'),env={...process.env,NODE_OPTIONS:'',KSF_PREPARED:target.prepared,KSF_PREPARATION_OS:target.os,KSF_PREPARATION_TOOLCHAINS:String(target.toolchains),KSF_PREPARATION_FULL:'true',KSF_PREPARATION_GROUPS:'',GITHUB_ENV:output};writeFileSync(output,'');
 const result=spawnSync(process.execPath,['.agents/core/runtime/src/testing/ci.js','prepare-groups'],{cwd:root,env,encoding:'utf8',timeout:30000});assert.equal(result.status,0,result.stderr);
 const line=readFileSync(output,'utf8');assert.equal(line.split('\n').length,2);assert.ok(line.startsWith('KSF_CI_GROUPS='));const groups=JSON.parse(line.slice('KSF_CI_GROUPS='.length));assert.ok(groups.include.every(g=>g.prepared===target.prepared&&g.platform===process.platform));
 writeFileSync(output,'');const failed=spawnSync(process.execPath,['.agents/core/runtime/src/testing/ci.js','prepare-groups'],{cwd:root,env:{...env,KSF_PREPARATION_OS:'wrong'},encoding:'utf8',timeout:30000});assert.notEqual(failed.status,0);assert.equal(readFileSync(output,'utf8'),'');
});

// Diagnose the actual contribution path, not only a manually mirrored checkout.
test('every local reusable workflow is explicitly projected from canonical Core source',t=>{
 const directory=repositoryWorkflows(t),prefix='.agents/core/distribution/repository/';
 for(const name of readdirSync(directory).filter(name=>name.endsWith('.yml'))){
  const workflow=YAML.parse(readFileSync(join(directory,name),'utf8'));
  for(const job of Object.values(workflow.jobs??{})){
   if(typeof job.uses!=='string'||!job.uses.startsWith('./.github/workflows/'))continue;
   const exported=job.uses.slice(2);
   assert.equal(repositoryExports[prefix+exported],exported,exported+' must be included by normal contribution');
   assert.ok(existsSync(join(directory,exported.slice('.github/workflows/'.length))));
  }
 }
});
