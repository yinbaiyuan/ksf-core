import assert from 'node:assert/strict';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import YAML from '../src/vendor/yaml/dist/index.js';

test('CI installs both application toolchains before running Core tests and uses the owned test entry', t => {
  const directory = fileURLToPath(new URL('../../../../.github/workflows/', import.meta.url));
  if (!existsSync(directory)) { t.skip('Installed Core packages do not include repository workflows.'); return; }
  let suites = 0;
  for (const name of readdirSync(directory).filter(name => /\.ya?ml$/.test(name))) {
    const workflow = YAML.parse(readFileSync(join(directory, name), 'utf8'));
    for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
      const steps = job.steps ?? [];
      const suite = steps.findIndex(step => /(?:\bksf(?:\.ps1)?\s+test\b|src\/cli\.js\s+test\b|node\s+--test\b)/.test(step.run ?? ''));
      if (suite < 0) continue;
      suites++;
      for (const part of ['web', 'sdk']) {
        const path = part === 'web' ? '.agents/core/runtime/web' : '.agents/core/applications/sdk';
        const install = steps.findIndex(step => step['working-directory'] === path && /\bnpm\s+ci\b/.test(step.run ?? ''));
        assert.ok(install >= 0 && install < suite, `${name}/${jobName}: install ${part} dependencies before the Core suite`);
      }
      const build = steps.findIndex(step => step['working-directory'] === '.agents/core/runtime/web' && /\bnpm\s+run\s+build\b/.test(step.run ?? ''));
      assert.ok(build >= 0 && build < suite, `${name}/${jobName}: build verified frontend assets before server tests`);
      assert.doesNotMatch(steps[suite].run, /node\s+--test\b/, `${name}/${jobName}: use the owned suite selector, not recursive vendor discovery`);
    }
  }
  assert.ok(suites > 0, 'At least one repository workflow must execute Core tests.');
});

test('CI verifies the shipped runtime through a launcher without forging bootstrap proof', t => {
  const directory = fileURLToPath(new URL('../../../../.github/workflows/', import.meta.url));
  if (!existsSync(directory)) { t.skip('Installed Core packages do not include repository workflows.'); return; }
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
  const directory = fileURLToPath(new URL('../../../../.github/workflows/', import.meta.url));
  if (!existsSync(directory)) { t.skip('Installed Core packages do not include repository workflows.'); return; }
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
  assert.ok(checked > 0);
});
