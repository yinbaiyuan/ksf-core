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
async function seal(root) {
  const contracts = await read(join(root, 'components/contracts.json'));
  const files = await registryFiles(root, contracts);
  await save(join(root, 'components/integrity.json'), {schemaVersion: 1, fingerprint: digest(JSON.stringify(files)), files});
}
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ksf-components SDK fixture-')));
  t.after(() => rm(root, {recursive: true, force: true}));
  const target = join(root, 'sdk'), app = join(root, 'app');
  const source = await loadRegistry(sdk);
  for (const file of [...Object.keys(source.integrity.files), 'components/integrity.json', 'build.mjs']) {
    await mkdir(dirname(join(target, file)), {recursive: true}); await copyFile(join(sdk, file), join(target, file));
  }
  await symlink(join(sdk,'node_modules'),join(target,'node_modules'),process.platform==='win32'?'junction':'dir');
  await mkdir(join(app, 'node_modules/@types'), {recursive: true});
  for (const name of ['react', 'react-dom', '@types/react', '@types/react-dom']) {
    await symlink(join(web, 'node_modules', name), join(app, 'node_modules', name), process.platform === 'win32' ? 'junction' : 'dir');
  }
  await save(join(app, 'package.json'), {name: 'component-test', type: 'module', dependencies: {'@ksf/sdk': 'file:../sdk', react: '19.3.1', 'react-dom': '19.3.1'}, scripts: {build: 'node build.mjs'}});
  await writeFile(join(app, 'build.mjs'), "import {buildApplication} from '../sdk/build.mjs';\nexport const build = () => buildApplication(import.meta.dirname);\n");
  return {root, target, app, query: request => queryComponents({appDir: app, ...request})};
}

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
