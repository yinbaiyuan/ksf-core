import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import YAML from '../src/vendor/yaml/dist/index.js';
import {loadCatalog} from '../src/testing/catalog.js';
import {createVerificationPlan, targets} from '../src/testing/ci-plan.js';
import {sourceIdentity} from '../src/testing/ci.js';

function repositoryWorkflows(t) {
  const root = fileURLToPath(new URL('../../../../', import.meta.url));
  const directory = join(root, '.agents/core/distribution/repository/.github/workflows');
  return directory;
}

test('CI prepares locked toolchains once per platform and restores them before full shards', t => {
  const directory = repositoryWorkflows(t); if (!directory) return;
  const verification = YAML.parse(readFileSync(join(directory, 'verification.yml'), 'utf8'));
  const setup = verification.jobs.platform.steps, full = verification.jobs.tests.steps;
  for (const part of ['applications/sdk', 'applications/projects', 'runtime/web']) {
    assert.ok(setup.some(s => s['working-directory'] === '.agents/core/'+part && /npm ci/.test(s.run ?? '')));
  }
  assert.ok(setup.findIndex(s => /npm run build/.test(s.run ?? '')) < setup.findIndex(s => /tar -cf prepared.tar/.test(s.run ?? '')));
  assert.ok(!setup.some(s => /ci.js run/.test(s.run ?? '')));
  assert.ok(full.findIndex(s => /tar -xf prepared.tar/.test(s.run ?? '')) < full.findIndex(s => /ci.js run-group/.test(s.run ?? '')));
  assert.ok(!full.some(s => /npm (?:test|ci)|release build|npm run build/.test(s.run ?? '')));
  for (const step of [...setup,...full]) assert.ok(!step.env?.NODE_OPTIONS);
  const check = YAML.parse(readFileSync(join(directory, 'check.yml'), 'utf8'));
  assert.equal(check.jobs.required.if, "always() && github.repository == 'yinbaiyuan/ksf-core'");assert.equal(check.jobs.required.needs, 'verification');
  assert.deepEqual(verification.jobs.coverage.needs, ['plan','platform','tests','linux-core']);
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
  for(const [job,id] of [['tests','tests'],['linux-core','tests']]){
    const steps=workflow.jobs[job].steps,run=steps.find(s=>s.id===id);
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
  assert.equal(workflow.jobs.tests.strategy.matrix, '${{ fromJSON(needs.plan.outputs.matrix) }}');
  const root=fileURLToPath(new URL('../../../../',import.meta.url)),catalog=loadCatalog(root);
  const plan=createVerificationPlan(root,{full:true},sourceIdentity(root));
  assert.equal(new Set(plan.groups.map(g=>g.id)).size,plan.groups.length);
  for(const target of targets){
    const groups=plan.groups.filter(g=>g.target===target.target),files=groups.flatMap(g=>g.files);
    const expected=catalog.tests.filter(t=>t.verification.lane===target.profile&&t.platforms.includes(target.platform)).map(t=>t.path);
    assert.deepEqual([...files].sort(),expected.sort());assert.equal(new Set(files).size,files.length);
    assert.ok(groups.length<=target.limit);
  }
  const shared=plan.groups.filter(g=>g.profile==='shared').flatMap(g=>g.files);
  assert.equal(shared.length,catalog.tests.filter(t=>t.verification.lane==='shared').length);
  assert.ok(plan.groups.filter(g=>g.platform==='win32').every(g=>g.profile==='native'));

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
  assert.deepEqual(targets.filter(t=>t.platform==='linux').map(t=>t.os),['ubuntu-22.04','ubuntu-24.04']);
  assert.equal(linux.strategy.matrix,'${{ fromJSON(needs.plan.outputs.linux) }}');
  assert.equal(linux['runs-on'],'${{ matrix.os }}');
  assert.ok(linux.steps.some(s=>/\.agents\/ksf runtime verify --json/.test(s.run??'')));
  assert.ok(linux.steps.some(s=>/ci.js run-group verification-plan.json/.test(s.run??'')));
  assert.ok(linux.steps.some(s=>/always\(\)/.test(s.if??'')&&s.with?.name==='group-${{ matrix.id }}'));

 });
