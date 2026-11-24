import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import YAML from '../src/vendor/yaml/dist/index.js';
import {repository} from './helpers/distribution-fixture.js';
import {reportPublication,inspectHandoff} from '../src/distribution/release-actions.js';
import {officialArchiveFixture as distributionFixture} from './helpers/distribution-fixture.js';
const directory = join(repository, '.agents/core/distribution/repository/.github/workflows');
test('official workflows use core-main, native platform evidence and one Core publisher', () => {
  const text = name => readFileSync(join(directory, name), 'utf8');
  const check = YAML.parse(text('check.yml')), release = YAML.parse(text('release.yml')), verification = YAML.parse(text('verification.yml'));
  assert.deepEqual(check.on.push.branches, ['core-main']); assert.deepEqual(check.on.pull_request.branches, ['core-main']);
  assert.equal(verification.jobs.platform.strategy.matrix, '${{ fromJSON(needs.plan.outputs.preparations) }}');
  const native=YAML.parse(text('verification-platform.yml'));
  assert.equal(native.jobs.tests.strategy.matrix, '${{ fromJSON(inputs.groups) }}');
  assert.ok(verification.jobs.plan.steps.some(s=>/ci.js plan/.test(s.run??'')));
  assert.deepEqual(check.jobs.required.needs,['reuse','verification']);
  for (const name of ['check.yml','release.yml','verification.yml']) {
    assert.ok(text(name).includes("github.repository == 'yinbaiyuan/ksf-core'"));
    assert.ok(!/ksf-workspace|KSF_TEMPLATE_APP|create-github-app-token|release template|release mirror|release-only/.test(text(name)));
  }
  assert.deepEqual(Object.keys(release.jobs), ['find-proof','verification','prepare','warm-windows-downloads','release']);
  const warm=release.jobs['warm-windows-downloads'];
  assert.equal(warm.needs,'find-proof');assert.match(warm.if,/refs\/heads\/core-main/);assert.match(warm.if,/needs.find-proof.outputs.valid == 'true'/);
  assert.equal(warm['runs-on'],'windows-2025');assert.deepEqual(warm.permissions,{contents:'read'});
  assert.ok(warm.steps.some(step=>step.id==='npm-cache'&&/npm config get cache/.test(step.run??'')));
  assert.ok(warm.steps.some(step=>step.id==='npm-downloads'&&step.with.path==='${{ steps.npm-cache.outputs.path }}'));
  assert.ok(warm.steps.some(step=>/wait "\$ksf_pid" \|\| ksf_install_status=\$\?/.test(step.run??'')));
  assert.ok(!JSON.stringify(warm).includes('release publish'));
  assert.ok(text('release.yml').includes('origin/core-main'));
  assert.ok(text('release.yml').includes('release publish'));
  assert.ok(text('verification-platform.yml').includes('restore-links'));
});
test('publication result must identify the exact frozen Core release', async t => {
  const f = await distributionFixture(t), identity = inspectHandoff({ root: f.root, directory: f.first.output });
  const data = { version: identity.version, published: true, repository: 'yinbaiyuan/ksf-core' };
  assert.equal(reportPublication({ root: f.root, directory: f.first.output, phase: 'core', result: { ok: true, data } }).published, true);
  for (const phase of ['template', 'workspace']) assert.throws(() => reportPublication({ root: f.root, directory: f.first.output, phase, result: { ok: true, data } }), { code: 'RELEASE_VERIFY_FAILED' });
});
