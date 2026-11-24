import {availableParallelism} from 'node:os';
import {hashFiles} from './fingerprint-worker.js';
import { readFileSync, readdirSync, lstatSync, existsSync, realpathSync, statSync } from 'node:fs';
import { join, resolve, relative, matchesGlob } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

export const catalogPath = '.agents/core/runtime/testing/catalog.json';
export const fail = (code, message, details = {}) => { throw Object.assign(new Error(message), { code, ...details }); };
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const slash = value => value.replaceAll('\\', '/');
// These outputs are rebuilt/verified from owned sources. Keep them in declared
// execution fingerprints, but exclude them from source identity and selection.
export const rebuiltArtifact = path => path === '.agents/core/manifest.yaml' || path.startsWith('.agents/core/runtime/web/dist/');
export function safePath(root, path) {
  const full = resolve(root, path), rel = slash(relative(root, full));
  if (!rel || rel.startsWith('../') || rel === '..' || rel.split('/').includes('.git')) fail('TEST_PATH_INVALID', 'Test paths must stay inside this KSF root.', { target: path });
  let current = root;
  for (const part of rel.split('/')) { current = join(current, part); if (existsSync(current) && lstatSync(current).isSymbolicLink()) fail('TEST_PATH_INVALID', 'Test inputs cannot traverse symlinks.', { target: path }); }
  return { full, rel };
}
const ignored = new Set(['node_modules', '.build', '.git', '.vite', 'coverage', 'test-results', '.impeccable', '.DS_Store']);
export function walk(root, path) {
  const { full, rel } = safePath(root, path);
  if (!existsSync(full)) return [];
  const stat = lstatSync(full);
  if (stat.isFile()) return [rel];
  if (!stat.isDirectory()) fail('TEST_INPUT_INVALID', 'Unsupported test input.', { target: rel });
  return readdirSync(full).sort().filter(name => !ignored.has(name)).flatMap(name => walk(root, `${rel}/${name}`));
}
export function loadCatalog(root) {
  let catalog;
  try { catalog = JSON.parse(readFileSync(join(root, catalogPath), 'utf8')); }
  catch (error) { fail('TEST_CATALOG_INVALID', `Cannot read the owned test catalog: ${error.message}`); }
  if (![1, 2].includes(catalog.schemaVersion) || !Array.isArray(catalog.tests) || !catalog.components || !Array.isArray(catalog.risks)) fail('TEST_CATALOG_INVALID', 'Unsupported test catalog.');
  if (catalog.schemaVersion === 2) for (const rule of catalog.risks) {
    if (!rule || !Array.isArray(rule.paths) || !rule.paths.length || !Array.isArray(rule.components) || !rule.components.length || rule.components.some(id => !Object.hasOwn(catalog.components,id)) || typeof rule.reason !== 'string' || !rule.reason) fail('TEST_CATALOG_INVALID', 'Risk rules must name owned components and explain their required coverage.');
    for (const path of rule.paths) safePath(root,path);
  }
  const ids = new Set(), files = new Set(), discovered = new Set();
  for (const [id, component] of Object.entries(catalog.components)) {
    if (!component.directory || !Array.isArray(component.testRoots)) fail('TEST_CATALOG_INVALID', `Invalid component ${id}.`);
    safePath(root, component.directory);
    for (const directory of component.testRoots) for (const path of walk(root, directory)) if (/\.test\.(?:[cm]?js|ts)$/.test(path) || path.endsWith('.ps1') && !path.includes('/helpers/')) discovered.add(path);
  }
  for (const item of catalog.tests) {
    if (!item.id || ids.has(item.id) || files.has(item.path) || !catalog.components[item.owner] || !['quick', 'full'].includes(item.suite) || !Array.isArray(item.inputs) || !Array.isArray(item.covers) || item.covers.some(id => !catalog.components[id]) || !Array.isArray(item.platforms) || !item.platforms.length || !Number.isInteger(item.timeoutMs) || item.timeoutMs < 1) fail('TEST_CATALOG_INVALID', `Invalid or duplicate test declaration: ${item.id ?? item.path}.`);
    if (item.isolation !== undefined && !['shared', 'exclusive'].includes(item.isolation)) fail('TEST_CATALOG_INVALID', `Unknown test resource policy: ${item.id}.`);
    if (catalog.schemaVersion === 2) {
      const v = item.verification;
      if (!v || !['shared', 'native'].includes(v.lane) || !['logic', 'contract', 'integration'].includes(v.kind) || !v.reason || v.kind === 'logic' && v.lane !== 'shared' || v.kind === 'contract' && v.lane !== 'native' || !Array.isArray(item.selectionInputs)) fail('TEST_CATALOG_INVALID', `A reviewed verification and selection policy is required: ${item.id}.`);
      if (item.platforms.some(p => !['darwin','win32','linux'].includes(p)) || new Set(item.platforms).size !== item.platforms.length || v.lane === 'shared' && !item.platforms.includes('darwin')) fail('TEST_CATALOG_INVALID', `Test has no supported CI obligation or shared baseline host: ${item.id}.`);
      if (v.nativeContracts !== undefined && !Array.isArray(v.nativeContracts) || v.lane === 'shared' && v.kind === 'integration' && !v.nativeContracts?.length) fail('TEST_CATALOG_INVALID', `Shared integration requires explicit native boundary coverage: ${item.id}.`);
      for (const input of item.selectionInputs) safePath(root, input);
      if (item.fixtures !== undefined && (!Array.isArray(item.fixtures) || item.fixtures.some(name => name !== 'distribution'))) fail('TEST_CATALOG_INVALID', `Unknown run fixture: ${item.id}.`);
    }
    ids.add(item.id); files.add(item.path);
    const { full } = safePath(root, item.path);
    if (!existsSync(full) || !lstatSync(full).isFile()) fail('TEST_CATALOG_STALE', 'A registered test file is missing.', { target: item.path });
    if (!discovered.has(item.path)) fail('TEST_CATALOG_INVALID', 'A registered file is outside owned test roots.', { target: item.path });
    for (const input of item.inputs) safePath(root, input);
  }
  for (const item of catalog.tests) for (const id of item.verification?.nativeContracts ?? []) if (!catalog.tests.some(t => t.id === id && t.verification?.lane === 'native')) fail('TEST_CATALOG_INVALID', `Missing native contract ${id} for ${item.id}.`);
  for (const path of discovered) if (!files.has(path)) fail('TEST_UNREGISTERED', 'A first-party test has no declaration. Register its coverage and profile.', { target: path });
  for (const [id, component] of Object.entries(catalog.components)) if (!catalog.tests.some(t => t.owner === id || t.covers.includes(id)) && !component.noTestsReason) fail('TEST_CATALOG_INVALID', `Component ${id} must declare tests, delegated coverage, or an explicit no-test reason.`);
  return { ...catalog, digest: sha256(JSON.stringify(catalog)) };
}
function fingerprintPlan(root, catalog, tests) {
  const files=new Set(), paths=new Map(), roots=new Map(), dependencyTrees=new Map();
  let hashes;
  const fileHash=path=>{files.add(path);return()=>hashes.get(path);};
  const constant=value=>()=>value;
  const memo=compute=>{let ready=false,value;return()=>{if(!ready){value=compute();ready=true;}return value;};};
  const digestInput=input=>{
    if(!roots.has(input)){
      const entries=walk(root,input).map(path=>{
        if(!paths.has(path))paths.set(path,[lstatSync(join(root,path)).mode & 0o777,fileHash(join(root,path))]);
        const [mode,hash]=paths.get(path);return()=>[path,[mode,hash()]];
      });
      roots.set(input,memo(()=>sha256(JSON.stringify(entries.map(entry=>entry())))));
    }
    return roots.get(input);
  };
  const environment=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(?:CI|TZ|LANG|LC_|NODE_|KSF_|GIT_|PATH$|Path$|SystemRoot$)/i.test(key)&&!/TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL/i.test(key)).sort(([a],[b])=>a.localeCompare(b)));
  const executable=fileHash(process.execPath),declaration=fileHash(join(root,catalogPath));
  const runtime=()=>[process.version,process.platform,process.arch,executable(),environment,declaration()];
  function dependencies(directory,ancestors=new Set()){
    if(!existsSync(directory))return constant('missing');
    const actual=realpathSync.native(directory);
    if(ancestors.has(actual))return constant('cycle');
    if(!dependencyTrees.has(actual)){
      const next=new Set([...ancestors,actual]),records=[];
      for(const entry of readdirSync(actual,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
        const name=entry.name;if(['.cache','.vite','.bin'].includes(name))continue;
        const path=join(actual,name),directory=entry.isDirectory()||!entry.isFile()&&statSync(path).isDirectory();
        records.push([name,directory?dependencies(path,next):fileHash(path)]);
      }
      dependencyTrees.set(actual,memo(()=>sha256(JSON.stringify(records.map(([name,hash])=>[name,hash()])))));
    }
    return dependencyTrees.get(actual);
  }
  const toolchains=[...new Set(Object.values(catalog.components).map(c=>c.directory).filter(path=>existsSync(join(root,path,'package.json'))))].sort().map(path=>{
    const packages=['package.json','package-lock.json'].map(name=>existsSync(join(root,path,name))?fileHash(join(root,path,name)):constant('missing'));
    const tree=dependencies(join(root,path,'node_modules'));return()=>[path,packages.map(hash=>hash()),tree()];
  });
  const selected=tests.map(item=>({id:item.id,inputs:[...new Set([item.path,...item.inputs])].sort().map(input=>[input,digestInput(input)])}));
  return {files,finish(values){hashes=values;const sharedRuntime=runtime(),sharedToolchains=toolchains.map(tree=>tree());return Object.fromEntries(selected.map(item=>[item.id,sha256(JSON.stringify([catalog.digest,sharedRuntime,sharedToolchains,item.inputs.map(([input,hash])=>[input,hash()])]))]));}};
}
export function inputFingerprints(root,catalog,tests){
  const plan=fingerprintPlan(root,catalog,tests),hashes=new Map();
  for(const path of plan.files)hashes.set(path,sha256(readFileSync(path)));
  return plan.finish(hashes);
}
// Only this invocation owns the enumerated graph and hashes. Both runner
// snapshots build new graphs; no validity or installed-toolchain cache survives.
export async function inputFingerprintsAsync(root,catalog,tests){
  const plan=fingerprintPlan(root,catalog,tests),files=[...plan.files];
  const count=Math.min(4,availableParallelism());
  const hashes=files.length>=10000&&count>1
    ? await hashFiles(files,{workers:count})
    : new Map(files.map(path=>[path,sha256(readFileSync(path))]));
  return plan.finish(hashes);
}
export function missingRequirements(root, catalog, tests) {
  const missing = [];
  for (const item of tests) {
    for (const requirement of item.requirements ?? []) {
      const name = typeof requirement === 'string' ? requirement : requirement.name;
      const directory = join(root, catalog.components[requirement.component ?? item.owner].directory);
      const require = createRequire(join(directory, 'package.json'));
      try { require.resolve(name); } catch { missing.push({ component: item.owner, dependency: name, directory: slash(relative(root, directory)), action: 'Install this component’s locked dependencies before testing.' }); }
    }
  }
  return [...new Map(missing.map(m => [JSON.stringify(m), m])).values()];
}
const plainPaths = new Map();
function plainPath(path) {
  if (!plainPaths.has(path)) plainPaths.set(path, /^[a-zA-Z0-9_./-]+$/.test(path) &&
    !/(?:\/\/|\/$|(?:^|\/)\.\.?(?:\/|$))/.test(path));
  return plainPaths.get(path);
}
export const matchesInput = (path, pattern) => {
  if (path === pattern || path.startsWith(pattern + '/')) return true;
  // Normalized ASCII literal paths have no glob syntax or separator/case
  // ambiguity. Avoid recompiling minimatch for every dependency comparison.
  if (plainPath(path) && plainPath(pattern)) return false;
  return matchesGlob(path, pattern);
};
