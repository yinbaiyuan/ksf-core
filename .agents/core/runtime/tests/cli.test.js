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
    encoding: 'utf8', env: { ...process.env, PATH: '' }, timeout: 15_000,
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
