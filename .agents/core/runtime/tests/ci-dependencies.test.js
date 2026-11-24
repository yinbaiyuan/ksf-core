import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import YAML from '../src/vendor/yaml/dist/index.js';
import {loadCatalog} from '../src/testing/catalog.js';
import {createVerificationPlan, targets,verificationTargets,runtimeOnlyNative,runtimeOnlyTest} from '../src/testing/ci-plan.js';
import {sourceIdentity} from '../src/testing/ci.js';

function repositoryWorkflows(t) {
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const directory = join(root, '.agents/core/distribution/repository/.github/workflows');
  return directory;
}

test('CI prepares locked toolchains once per platform and restores them before full shards', t => {
  const directory = repositoryWorkflows(t); if (!directory) return;
  const verification = YAML.parse(readFileSync(join(directory, 'verification.yml'), 'utf8'));
  const native = YAML.parse(readFileSync(join(directory, 'verification-platform.yml'), 'utf8'));
  const setup = native.jobs.prepare.steps, full = native.jobs.tests.steps;
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
  assert.deepEqual(verification.jobs.coverage.needs, ['plan','platform','linux-core']);
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
 assert.equal(native.jobs.prepare['runs-on'],'${{ inputs.os }}');
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
 const native=YAML.parse(readFileSync(join(repositoryWorkflows(),'verification-platform.yml'),'utf8'));
 const install=native.jobs.prepare.steps.find(s=>s.name==='Install locked platform dependencies'),freeze=native.jobs.prepare.steps.find(s=>s.name==='Freeze prepared toolchains'),run=native.jobs.tests.steps.find(s=>s.id==='tests');
 assert.match(install.run,/prepare-ci-fixtures.js.*ksf_fixtures_pid=\$!/);assert.match(install.run,/for ksf_pid in .*"\$ksf_fixtures_pid"/);
 assert.equal(install.env.KSF_CI_GROUPS,'${{ inputs.groups }}');assert.match(freeze.run,/tar -cf -.*\.agents\/runtime-data\/ci-seeds/);
 assert.equal(run.env.KSF_TEST_CI_PREPARED_SEEDS,'.agents/runtime-data/ci-seeds');
});

test('runtime-only transaction groups keep every native file and preserve hosted worker limits',()=>{
 const root=fileURLToPath(new URL('../../../../',import.meta.url)),catalog=loadCatalog(root),plan=createVerificationPlan(root,{full:true},sourceIdentity(root));
 assert.equal(runtimeOnlyNative.size,32);
 for(const id of runtimeOnlyNative){const t=catalog.tests.find(t=>t.id===id);assert.ok(t,id);assert.equal(t.verification.lane,'native');assert.equal(t.isolation,'exclusive');assert.deepEqual(t.fixtures,['distribution']);assert.deepEqual(t.requirements,[]);}
 for(const platform of ['darwin','win32']){
  const groups=plan.groups.filter(g=>g.platform===platform),files=groups.flatMap(g=>g.files),expected=catalog.tests.filter(t=>t.platforms.includes(platform)&&!(platform==='darwin'&&t.verification.lane==='shared'&&t.platforms.includes('linux'))&&!(platform==='win32'&&t.verification.lane==='shared')).map(t=>t.path);
  assert.deepEqual([...files].sort(),expected.sort());assert.equal(new Set(files).size,files.length);assert.ok(groups.length<=(platform==='darwin'?5:12));
  for(const g of groups.filter(g=>g.toolchains===false)){assert.equal(g.profile,'native');assert.ok(g.files.every(path=>runtimeOnlyNative.has(catalog.tests.find(t=>t.path===path).id)));}
 }
 const wf=YAML.parse(readFileSync(join(repositoryWorkflows(),'verification-platform.yml'),'utf8')),prepare=wf.jobs.prepare.steps;
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
