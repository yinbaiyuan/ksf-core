import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir, mkdtemp, copyFile, rm, symlink, readdir, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {queryComponents, runComponentsCLI} from '../server/components/query.mjs';
import {loadRegistry, registryFiles, digest} from '../server/components/registry.mjs';
import {readComponentRecord, catalogItems} from '../src/component-catalog.js';
const sdk = fileURLToPath(new URL('../', import.meta.url));
const web = resolve(sdk, '../../runtime/web');
const exec = promisify(execFile);
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
import {fixture, seal} from './helpers/components-fixture.mjs';

test('same SDK version with changed bytes is unknown until maintained metadata matches the target', async t => {
  const f = await fixture(t), file = join(f.target, 'src/component-examples/button-basic.tsx');
  await writeFile(file, (await readFile(file, 'utf8')) + '\n// Target-specific example revision.\n');
  const stale = await f.query({operation: 'example', selector: 'button.basic'});
  assert.equal(stale.ok, false); assert.equal(stale.targetSupport.status, 'unknown');
  assert.equal(stale.error.code, 'COMPONENT_INTEGRITY_MISMATCH'); assert.equal(stale.example, null);
  await seal(f.target);
  const updated = await f.query({operation: 'example', selector: 'button.basic'});
  assert.equal(updated.ok, true); assert.match(updated.example.source, /Target-specific/);
  assert.equal(updated.catalogSource.sdkVersion, updated.contractSource.sdkVersion);
  assert.notEqual(updated.catalogSource.fingerprint, updated.contractSource.fingerprint);
});

test('missing public subpath is unsupported even if the private source file remains', async t => {
  const f = await fixture(t), file = join(f.target, 'package.json'), pkg = await read(file);
  delete pkg.exports['./button']; await save(file, pkg);
  const result = await f.query({operation: 'example', selector: 'button.basic'});
  assert.equal(result.ok, false); assert.equal(result.targetSupport.status, 'unsupported');
  assert.equal(result.error.code, 'SDK_EXPORT_MISSING'); assert.equal(result.example, null);
  assert.ok(await readFile(join(f.target, 'src/button.tsx')));
});

test('a named TSX export removed under the same path is rejected by actual compiler probes', async t => {
  const f = await fixture(t), file = join(f.target, 'src/button.tsx');
  await writeFile(file, (await readFile(file, 'utf8')).replace('export const Button =', 'export const DifferentButton ='));
  await seal(f.target);
  const result = await f.query({operation: 'example', selector: 'button.basic'});
  assert.equal(result.ok, false); assert.equal(result.targetSupport.status, 'unsupported');
  assert.equal(result.error.code, 'EXAMPLE_TYPECHECK_FAILED'); assert.equal(result.example, null);
});

test('conditional type declarations cannot mask a missing JavaScript runtime export', async t => {
  const f = await fixture(t), file = join(f.target, 'package.json'), pkg = await read(file);
  pkg.exports['./button'] = {types: './src/button-types.d.ts', import: './src/button-runtime.mjs'};
  await save(file, pkg);
  await writeFile(join(f.target, 'src/button-types.d.ts'), 'export declare const Button: any; export type ButtonProps = any; export type ButtonVariant = string;\n');
  await writeFile(join(f.target, 'src/button-runtime.mjs'), 'export const WrongButton = () => null;\n');
  await seal(f.target);
  const result = await f.query({operation: 'read', selector: 'ACT-01'});
  assert.equal(result.targetSupport.status, 'unsupported'); assert.equal(result.targetSupport.reason, 'SDK_NAMED_EXPORT_MISSING');
  assert.equal(result.canGenerateSdkUsage, false);
});

test('a type-correct public source with changed prop types fails the selected example', async t => {
  const f = await fixture(t), file = join(f.target, 'src/button.tsx');
  await writeFile(file, (await readFile(file, 'utf8')).replace("'outlined' | 'solid' | 'soft' | 'text' | 'dashed'", "'outlined' | 'solid' | 'text' | 'dashed'"));
  await seal(f.target);
  const result = await f.query({operation: 'example', selector: 'button.basic'});
  assert.equal(result.ok, false); assert.equal(result.targetSupport.status, 'unsupported');
  assert.match(result.targetSupport.message, /soft/);
});
