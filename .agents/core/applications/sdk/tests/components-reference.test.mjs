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

test('unknown selectors, malformed flags and missing targets never return fallback example code', async () => {
  const unknown = await queryComponents({operation: 'read', selector: 'UNKNOWN-00'}); assert.equal(unknown.ok, false);
  const example = await queryComponents({operation: 'example', selector: 'button.missing'}); assert.equal(example.ok, false); assert.equal(example.error.code, 'EXAMPLE_NOT_FOUND');
  const noTarget = await queryComponents({operation: 'example', selector: 'button.basic'}); assert.equal(noTarget.ok, false); assert.equal(noTarget.example, null);
  assert.equal((await queryComponents({operation: 'read', selector: 'Button', appDir: {}})).ok, false);
  for (const args of [['read', 'Button', '--app-dir'], ['read', 'Button', '--wat'], ['search', '--limit', 'NaN'], ['example', 'Button'], ['read', 'Button', '--json', '--json']]) assert.equal((await runComponentsCLI(args)).ok, false);
  const cli = join(sdk, 'scripts/ksf-app.mjs');
  const help = JSON.parse((await exec(process.execPath, [cli, 'components', '--help', '--json'])).stdout); assert.equal(help.ok, true); assert.equal(help.help.operations.length, 3);
  try {await exec(process.execPath, [cli, 'components', 'example', 'EXT-01', '--json']); assert.fail('must return nonzero');}
  catch (error) {assert.equal(error.code, 1); assert.equal(JSON.parse(error.stdout).error.code, 'COMPONENT_NOT_IMPLEMENTED');}
});


test('reference targets upgrade independently of adoption, and floating sources or planned adoption are rejected', async t => {
  const f=await fixture(t),file=join(f.target,'components/references.json'),references=await read(file);
  references.baseline.version='6.8.0';
  references.components['ACT-01'].target=references.components['ACT-01'].target.map(source=>({...source,version:'6.8.0',sourceUrl:source.sourceUrl.replace('/6.7.1/','/6.8.0/'),documentationUrl:source.documentationUrl.replace('/6.7.1/','/6.8.0/')}));
  await save(file,references);await seal(f.target);
  let registry=await loadRegistry(f.target);assert.equal(registry.references.components['ACT-01'].adopted[0].version,'6.7.1');
  const pinnedSource=references.components['ACT-01'].target[0];
  pinnedSource.sourceUrl='https://github.com/ant-design/ant-design/blob/6.8.0/components/button/button.tsx';await save(file,references);await seal(f.target);await loadRegistry(f.target);
  pinnedSource.sourceUrl=pinnedSource.sourceUrl.replace('/6.8.0/','/6.7.1/');await save(file,references);await seal(f.target);await assert.rejects(loadRegistry(f.target),{code:'COMPONENT_REFERENCE_INVALID'});
  pinnedSource.sourceUrl=pinnedSource.sourceUrl.replace('/6.7.1/','/6.8.0/');
  references.components['ACT-01'].target[0].documentationUrl='https://ant.design/components/button/';await save(file,references);await seal(f.target);
  await assert.rejects(loadRegistry(f.target),{code:'COMPONENT_REFERENCE_INVALID'});
  references.components['ACT-01'].target[0].documentationUrl='https://github.com/ant-design/ant-design/blob/6.8.0/components/button/index.en-US.md';
  references.components['EXT-01'].adopted=references.components['ACT-01'].adopted;await save(file,references);await seal(f.target);
  await assert.rejects(loadRegistry(f.target),{code:'COMPONENT_REFERENCE_INVALID'});
});

test('free Kokonut sources are individually pinned; compositions verify actual dependencies without a business export', async t => {
  const registry = await loadRegistry(sdk), coverage = registry.references.coverage.filter(row => row.library === 'Kokonut UI');
  assert.equal(coverage.length,116); assert.equal(new Set(coverage.map(row=>row.component)).size,116);
  for(const row of coverage){assert.ok(row.ksfIds.every(id=>registry.items.some(item=>item.id===id)));const source=registry.references.components[row.ksfIds[0]].target.find(source=>source.id===row.referenceId);assert.equal(source.version,'655ec61161aff87721e4c60c3cc4dc3329f3e80e');assert.equal(source.license,'MIT');assert.match(source.sourceUrl,/kokonut-labs\/kokonutui\/blob\/[a-f0-9]{40}\//);}
  const f=await fixture(t), result=await f.query({operation:'example',selector:'kokonut.cart-button'});
  assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.binding,null);assert.match(result.example.source,/from '@ksf\/sdk\/component-examples\/shopping-cart-view'/);
  const file=join(f.target,'package.json'),pkg=await read(file);delete pkg.exports['./component-examples/shopping-cart-view'];await save(file,pkg);
  const missing=await f.query({operation:'example',selector:'kokonut.cart-button'});assert.equal(missing.ok,false);assert.equal(missing.example,null);assert.equal(missing.targetSupport.reason,'SDK_EXPORT_MISSING');
});
