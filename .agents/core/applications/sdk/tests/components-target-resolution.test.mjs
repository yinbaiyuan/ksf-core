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

test('legacy SDK without metadata is unknown; no unsupported metadata is synthesized', async t => {
  const f = await fixture(t); await rm(join(f.target, 'components'), {recursive: true});
  const result = await f.query({operation: 'read', selector: 'Button'});
  assert.equal(result.targetSupport.status, 'unknown'); assert.equal(result.targetSupport.reason, 'SDK_METADATA_MISSING');
  assert.equal(result.contract, null); assert.equal(result.canGenerateSdkUsage, false);
});

test('dependency/build conflict cannot be overridden with an explicit SDK', async t => {
  const f = await fixture(t), other = join(f.root, 'other-sdk');
  await mkdir(other); await copyFile(join(f.target, 'package.json'), join(other, 'package.json'));
  await writeFile(join(other, 'build.mjs'), 'export function buildApplication(){}');
  await writeFile(join(f.app, 'build.mjs'), "import {buildApplication} from '../other-sdk/build.mjs';\n");
  const result = await f.query({operation: 'read', selector: 'Button', sdkRoot: f.target});
  assert.equal(result.targetSupport.status, 'unknown'); assert.equal(result.targetSupport.reason, 'SDK_SOURCE_MISMATCH');
});

test('custom builders need explicit SDK identity; mismatched TS aliases remain unknown', async t => {
  const f = await fixture(t);
  await writeFile(join(f.app, 'build.mjs'), '// a custom build script, never executed\n');
  assert.equal((await f.query({operation: 'read', selector: 'Button'})).targetSupport.reason, 'BUILD_SDK_UNRESOLVED');
  const explicit = await f.query({operation: 'read', selector: 'Button', sdkRoot: f.target});
  assert.equal(explicit.targetSupport.status, 'supported'); assert.equal(explicit.target.resolution, 'explicit-and-dependency');
  await writeFile(join(f.app, 'frontend.tsx'), 'export {};');
  await save(join(f.app, 'tsconfig.json'), {compilerOptions: {paths: {'@ksf/sdk/*': ['../wrong-sdk/src/*']}}, include: ['frontend.tsx']});
  const result = await f.query({operation: 'read', selector: 'Button', sdkRoot: f.target});
  assert.equal(result.targetSupport.status, 'unknown'); assert.equal(result.targetSupport.reason, 'SDK_TYPE_SOURCE_MISMATCH');
});

test('queries never import target runtime code or modify the target app', async t => {
  const f = await fixture(t), pkgFile = join(f.target, 'package.json'), pkg = await read(pkgFile), marker = join(f.root, 'EXECUTED');
  pkg.exports['./button'] = {types: './src/button-types.d.ts', import: './src/button-runtime.mjs'};
  await save(pkgFile, pkg);
  await writeFile(join(f.target, 'src/button-types.d.ts'), 'export declare const Button: any; export type ButtonProps = any; export type ButtonVariant = string;\n');
  await writeFile(join(f.target, 'src/button-runtime.mjs'), `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'bad'); export const Button = () => null;\n`);
  await seal(f.target);
  const before = await readdir(f.app), packageBefore = await readFile(join(f.app, 'package.json'), 'utf8');
  await f.query({operation: 'example', selector: 'button.basic'});
  await assert.rejects(readFile(marker), {code: 'ENOENT'});
  assert.deepEqual(await readdir(f.app), before); assert.equal(await readFile(join(f.app, 'package.json'), 'utf8'), packageBefore);
});

test('a project-local npm command shim resolves to the installed SDK on every platform', async t => {
  const f = await fixture(t);
  await mkdir(join(f.target, 'scripts'), {recursive: true});
  await copyFile(join(sdk, 'scripts/ksf-app.mjs'), join(f.target, 'scripts/ksf-app.mjs'));
  await mkdir(join(f.app, 'node_modules/@ksf'), {recursive: true});
  await symlink(f.target, join(f.app, 'node_modules/@ksf/sdk'), process.platform === 'win32' ? 'junction' : 'dir');
  await mkdir(join(f.app, 'node_modules/.bin'), {recursive: true});
  await writeFile(join(f.app, 'node_modules/.bin/ksf-app.cmd'), '@echo off\nnode "%~dp0\\..\\@ksf\\sdk\\scripts\\ksf-app.mjs" %*\n');
  const pkg = await read(join(f.app, 'package.json')); pkg.scripts.build = 'ksf-app local . --build-only'; await save(join(f.app, 'package.json'), pkg);
  const result = await f.query({operation: 'read', selector: 'Button'});
  assert.equal(result.targetSupport.status, 'supported'); assert.equal(result.target.sdkRoot, f.target);
});
