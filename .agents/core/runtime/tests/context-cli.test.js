import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, cpSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runContextCommand } from '../src/commands/context.js';
import { types } from '../src/objects/schema.js';

const runtime = fileURLToPath(new URL('../', import.meta.url));
function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ksf context CLI ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const def of Object.values(types)) for (const source of ['system', 'user']) mkdirSync(join(root, def[source]), { recursive: true });
  return root;
}

test('context has both help levels and is linked from top-level help', () => {
  const top = spawnSync(process.execPath, [join(runtime, 'src/cli.js'), '--help'], { encoding: 'utf8' });
  assert.equal(top.status, 0, top.stderr);
  assert.match(top.stdout, /ksf context --help/);
  for (const args of [[], ['--help'], ['-h'], ['capabilities', '--help'], ['capabilities', '-h']]) {
    const result = runContextCommand(args, '/nonexistent');
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /ksf context capabilities \[--json\]/);
  }
});

test('unknown operations, filters, targets and repeated flags return exit 2', t => {
  const root = fixture(t);
  for (const args of [
    ['catalog'], ['discover'], ['--json'], ['--help', '--json'], ['--help', '--help'],
    ['capabilities', 'partner.test.a'], ['capabilities', '--source', 'all'],
    ['capabilities', '--fields', 'name'], ['capabilities', '--json', '--json'],
    ['capabilities', '--json=true'], ['capabilities', '--help', '--json'],
    ['capabilities', '--help', '--help'], ['capabilities', '--unknown'],
    ['capabilities', '--json', '--', 'target'],
  ]) {
    const result = runContextCommand([...args, '--json'], root);
    assert.equal(result.exitCode, 2, args.join(' '));
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.errors[0].code, 'INVALID_ARGUMENTS');
    assert.deepEqual(Object.keys(parsed), ['ok', 'command', 'operation', 'data', 'errors']);
  }
});

test('text and JSON expose the same complete set with cooperations first and raw descriptions', t => {
  const root = fixture(t), folder = join(root, types.partner.system, 'partner.test.demo');
  mkdirSync(folder);
  const description = '中文第一行\n第二行\n\n最后一行。\n';
  writeFileSync(join(folder, 'partner.md'), `---\nid: partner.test.demo\nname: 示例搭档\nstatus: active\nversion: 0.1.0\ndescription: |\n  中文第一行\n  第二行\n\n  最后一行。\n---\nPRIVATE_BODY\n`);
  const text = runContextCommand(['capabilities'], root);
  assert.equal(text.exitCode, 0);
  assert.ok(text.stdout.indexOf('## Cooperations') < text.stdout.indexOf('## Partners'));
  assert.match(text.stdout, /Cooperations \(complete\)\n\(empty\)/);
  assert.ok(text.stdout.includes(description));
  assert.ok(text.stdout.includes('partner.test.demo'));
  assert.match(text.stdout, /Definition: .agents\/core\/abilities\/partners\/partner.test.demo\/partner.md/);
  assert.ok(!text.stdout.includes('PRIVATE_BODY'));
  const json = runContextCommand(['capabilities', '--json'], root);
  const result = JSON.parse(json.stdout);
  assert.equal(json.exitCode, 0);
  assert.equal(result.command, 'context');assert.equal(result.operation, 'capabilities');
  assert.equal(result.data.partners.objects[0].description, description);
  assert.equal(result.data.partners.objects[0].protected, false);
});

test('partial failure is exit 1 with business JSON on stdout and useful data retained', t => {
  const root = fixture(t);
  rmSync(join(root, types.cooperation.system), { recursive: true });
  const result = runContextCommand(['capabilities', '--json'], root);
  assert.equal(result.exitCode, 1);
  const response = JSON.parse(result.stdout);
  assert.equal(response.ok, false);
  assert.equal(response.data.complete, false);
  assert.equal(response.data.cooperations.complete, false);
  assert.equal(response.data.partners.complete, true);
  const text = runContextCommand(['capabilities'], root);
  assert.equal(text.exitCode, 1);assert.match(text.stdout, /Cooperations \(incomplete\)/);
  assert.match(text.stdout, /## Errors/);
});

test('real JS entry propagates results and exit codes outside the KSF cwd with empty PATH', t => {
  const root = fixture(t), deployed = join(root, '.agents/core/runtime');
  mkdirSync(deployed, { recursive: true });
  cpSync(join(runtime, 'src'), join(deployed, 'src'), { recursive: true });
  cpSync(join(runtime, 'package.json'), join(deployed, 'package.json'));
  const other = join(root, 'other');mkdirSync(other);
  const launch = (...args) => spawnSync(process.execPath, [join(deployed, 'src/cli.js'), 'context', ...args],
    { cwd: other, encoding: 'utf8', env: { ...process.env, PATH: '' } });
  const success = launch('capabilities', '--json');
  assert.equal(success.status, 0, success.stderr);assert.equal(success.stderr, '');
  assert.equal(JSON.parse(success.stdout).data.complete, true);
  rmSync(join(root, types.partner.user), { recursive: true });
  const partial = launch('capabilities', '--json');
  assert.equal(partial.status, 1);assert.equal(partial.stderr, '');
  assert.equal(JSON.parse(partial.stdout).data.cooperations.complete, true);
  assert.equal(JSON.parse(partial.stdout).data.partners.complete, false);
  const invalid = launch('capabilities', '--source', 'system', '--json');
  assert.equal(invalid.status, 2);assert.equal(invalid.stderr, '');
  assert.equal(JSON.parse(invalid.stdout).errors[0].code, 'INVALID_ARGUMENTS');
});
