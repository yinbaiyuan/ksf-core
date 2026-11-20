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

test('catalog, formal contracts and default no-target reads preserve delivery and token-sized lookup', async () => {
  const registry = await loadRegistry(sdk);
  assert.ok(registry.items.length >= 119); assert.equal(registry.groups.length, 14);
  assert.ok(registry.contracts.length >= 13); assert.ok(catalogItems.length >= 119);
  const found = await queryComponents({operation: 'search', selector: '保存操作'});
  assert.equal(found.items[0].id, 'ACT-01'); assert.equal(found.items[0].delivery, 'available');
  assert.equal(found.items[0].targetSupport.status, 'unknown');
  const result = await queryComponents({operation: 'read', selector: 'Button'});
  assert.equal(result.canGenerateSdkUsage, false); assert.equal(result.targetSupport.reason, 'TARGET_REQUIRED');
  assert.deepEqual(result.contract, readComponentRecord('ACT-01').contract);
  assert.ok(result.examples.length); assert.ok(result.examples.every(value => !('source' in value)));
});

test('planned records have no binding, formal API or executable examples; proposals are opt-in', async t => {
  assert.equal((await queryComponents({operation: 'search', selector: 'VirtualList'})).items.length, 0);
  const result = await queryComponents({operation: 'read', selector: 'EXT-01'});
  assert.equal(result.ok, true); assert.equal(result.component.delivery, 'planned');
  assert.equal(result.targetSupport.status, 'notApplicable'); assert.equal(result.binding, null);
  assert.equal(result.contract, null); assert.equal(result.releasedApi, null); assert.deepEqual(result.examples, []);
  assert.equal(result.proposal, undefined);
  const f = await fixture(t);
  await save(join(f.target, 'components/proposals.json'), [{id:'EXT-01',name:'VirtualList',documentStatus:'proposal',proposedApi:[{name:'value',type:'string',defaultValue:'待定',description:'测试候选接口'}],responsibilities:{component:[],application:[],host:[]}}]);
  await seal(f.target);
  for(const file of ['src/component-catalog.js','server/source-path.mjs',...['query','registry','target','typecheck'].map(name=>'server/components/'+name+'.mjs')]){await mkdir(dirname(join(f.target,file)),{recursive:true});await copyFile(join(sdk,file),join(f.target,file));}
  const fixtureQuery = (await import(pathToFileURL(join(f.target, 'server/components/query.mjs')).href)).queryComponents;
  const proposal = await fixtureQuery({operation: 'read', selector: 'VirtualList', includeProposal: true});
  assert.equal(proposal.proposal.documentStatus, 'proposal'); assert.equal(proposal.canGenerateSdkUsage, false);
  const example = await queryComponents({operation: 'example', selector: 'EXT-01'});
  assert.equal(example.ok, false); assert.equal(example.error.code, 'COMPONENT_NOT_IMPLEMENTED'); assert.equal(example.example, null);
});

test('real app/SDK resolution validates all delivered kinds and returns the target example source', async t => {
  const f = await fixture(t);
  const result = await f.query({operation: 'search', limit: 200});
  assert.equal(result.items.length, (await loadRegistry(sdk)).contracts.length); assert.ok(result.items.every(value => value.targetSupport.status === 'supported'), JSON.stringify(result.items.filter(value => value.targetSupport.status !== 'supported').map(({id,targetSupport})=>({id,targetSupport}))));
  const example = await f.query({operation: 'example', selector: 'button.basic'});
  assert.equal(example.ok, true); assert.equal(example.target.sdkRoot, f.target);
  assert.equal(example.target.resolution, 'dependency-and-build');
  assert.equal(example.example.source, await readFile(join(f.target, example.example.file), 'utf8'));
  assert.equal(example.example.sha256, digest(example.example.source));
  assert.equal(example.contractSource.fingerprint, example.targetSupport.proof.sdkFingerprint);
});

test('search isolates an invalid example while preserving verified support and per-component proofs', async t => {
  const f = await fixture(t), file = join(f.target, 'src/component-examples/button-basic.tsx');
  const valid = await f.query({operation: 'search', selector: 'Button', limit: 2});
  const original = await loadRegistry(f.target);
  for (const item of valid.items) {
    assert.equal(item.targetSupport.status, 'supported');
    assert.deepEqual(item.targetSupport.proof.exampleIds, original.contracts.find(contract => contract.id === item.id).examples.map(example => example.id));
    assert.equal(item.targetSupport.proof.sdkFingerprint, original.identity.fingerprint);
  }
  await writeFile(file, (await readFile(file, 'utf8')) + '\nconst invalidExample: number = "invalid";\n');
  await seal(f.target);
  const result = await f.query({operation: 'search', selector: 'Button', limit: 2});
  assert.equal(result.ok, true); assert.equal(result.items.length, 2);
  const button = result.items.find(item => item.id === 'ACT-01');
  const iconButton = result.items.find(item => item.id === 'ACT-02');
  assert.equal(button.targetSupport.status, 'unsupported');
  assert.equal(button.targetSupport.reason, 'EXAMPLE_TYPECHECK_FAILED');
  assert.equal(button.canGenerateSdkUsage, false);
  assert.equal(iconButton.targetSupport.status, 'supported');
  assert.equal(iconButton.canGenerateSdkUsage, true);
  const registry = await loadRegistry(f.target);
  assert.deepEqual(iconButton.targetSupport.proof.exampleIds, registry.contracts.find(contract => contract.id === 'ACT-02').examples.map(example => example.id));
  assert.equal(iconButton.targetSupport.proof.sdkFingerprint, registry.identity.fingerprint);
});
