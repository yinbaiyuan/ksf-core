import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const runtime = fileURLToPath(new URL('../', import.meta.url));

test('CLI documents the JavaScript test command', () => {
  const result = spawnSync(process.execPath, [join(runtime, 'src/cli.js'), '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ksf test\s+Run JavaScript tests/);
});

test('CLI documents the manifest build command', () => {
  const result = spawnSync(process.execPath, [join(runtime, 'src/cli.js'), '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ksf build\s+Generate manifest/);
});

test('test command forwards a failing test runner exit code without global Node', t => {
  const fixture = mkdtempSync(join(tmpdir(), 'ksf js test command '));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  cpSync(join(runtime, 'src'), join(fixture, 'src'), { recursive: true });
  cpSync(join(runtime, 'package.json'), join(fixture, 'package.json'));
  mkdirSync(join(fixture, 'tests'));
  writeFileSync(join(fixture, 'tests/failing.test.js'),
    'import { test } from "node:test"; import assert from "node:assert/strict";\n' +
    'test("deliberate runner failure", () => assert.fail("EXPECTED_TEST_FAILURE"));\n');
  const result = spawnSync(process.execPath, [join(fixture, 'src/cli.js'), 'test'], {
    // The fixture owns its complete tiny suite; outer CI sharding must not select it.
    encoding: 'utf8', env: { ...process.env, PATH: '', NODE_OPTIONS: '' }, timeout: 15_000,
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /EXPECTED_TEST_FAILURE/);
});

test('test command rejects unsupported options', () => {
  const result = spawnSync(process.execPath, [join(runtime, 'src/cli.js'), 'test', '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).error.code, 'INVALID_ARGUMENTS');
});

test('test command includes both owned suites and excludes vendored tests and fixture programs', t => {
  const fixture = mkdtempSync(join(tmpdir(), 'ksf owned test suites '));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  cpSync(join(runtime, 'src'), join(fixture, 'src'), { recursive: true });
  cpSync(join(runtime, 'package.json'), join(fixture, 'package.json'));
  for (const directory of ['tests', 'web/tests', 'native/upstream']) mkdirSync(join(fixture, directory), { recursive: true });
  writeFileSync(join(fixture, 'tests/core.test.js'),
    'import {test} from "node:test"; test("OWNED_CORE_SUITE",()=>{});');
  writeFileSync(join(fixture, 'web/tests/view.test.ts'),
    'import {test} from "node:test"; const label:string="OWNED_WEB_SUITE"; test(label,()=>{});');
  writeFileSync(join(fixture, 'native/upstream/foreign.test.js'), 'throw Error("VENDORED_TEST_MUST_NOT_RUN");');
  writeFileSync(join(fixture, 'tests/acceptance-fixture.mjs'), 'throw Error("FIXTURE_MUST_NOT_RUN");');
  const result = spawnSync(process.execPath, [join(fixture, 'src/cli.js'), 'test'], {
    // The fixture owns its complete tiny suite; outer CI sharding must not select it.
    encoding: 'utf8', env: { ...process.env, PATH: '', NODE_OPTIONS: '' }, timeout: 15_000,
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /OWNED_CORE_SUITE/);
  assert.match(result.stdout, /OWNED_WEB_SUITE/);
  assert.doesNotMatch(result.stdout + result.stderr, /VENDORED_TEST_MUST_NOT_RUN|FIXTURE_MUST_NOT_RUN/);
});
