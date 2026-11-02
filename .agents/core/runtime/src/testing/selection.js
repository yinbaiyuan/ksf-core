import {readFileSync, existsSync, statSync} from 'node:fs';
import {join, dirname, resolve, relative} from 'node:path';
import { matchesInput, walk, slash } from './catalog.js';

// Literal dependencies only widen candidates. Reviewed selectionInputs and
// risk rules establish mapped ownership; incidental strings/comments must not
// suppress the full-component fallback for an otherwise unmapped change.
export function dependencyInputs(root, paths) {
  const edges = new Map();
  const sdk = '.agents/core/applications/sdk';
  let exports;
  function references(path) {
    if (edges.has(path)) return edges.get(path);
    const found = new Set(); edges.set(path,found);
    if (!existsSync(join(root,path)) || !/\.[cm]?[jt]sx?$/.test(path)) return found;
    const text = readFileSync(join(root,path),'utf8');
    for (const match of text.matchAll(/(['"`])((?:\.\.?\/|@ksf\/sdk(?:\/|(?=['"`])))(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*)\1/g)) {
      let spec = match[2].replace(/\\(?:u\{([\da-f]+)\}|u([\da-f]{4})|x([\da-f]{2})|(\r?\n)|([\s\S]))/gi,
        (_,point,unicode,hex,continuation,char) => point||unicode||hex ? String.fromCodePoint(parseInt(point??unicode??hex,16)) : continuation ? '' : ({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0'}[char] ?? char)), target;
      if (spec.startsWith('@ksf/sdk')) {
        exports ??= JSON.parse(readFileSync(join(root,sdk,'package.json'),'utf8')).exports;
        const value = exports[spec === '@ksf/sdk' ? '.' : '.'+spec.slice('@ksf/sdk'.length)];
        target = resolve(root,sdk,typeof value === 'string' ? value : '.');
      } else {
        const dynamic = spec.search(/\$\{|\*/);
        if (dynamic >= 0) spec = spec.slice(0,dynamic).replace(/[^/]*$/, '');
        target = resolve(root,dirname(path),spec);
      }
      if (!target) continue;
      const candidates = [target, ...['.js','.mjs','.ts','.tsx','.json'].map(ext=>target+ext), target.replace(/\.js$/,'.ts')];
      target = candidates.find(p=>existsSync(p)) ?? target;
      const rel = slash(relative(root,target));
      if (!rel.startsWith('.agents/core/') || rel.includes('/node_modules/') || rel.includes('/.git/')) continue;
      found.add(rel);
      if (existsSync(target) && statSync(target).isDirectory()) for (const child of walk(root,rel)) if (/\.[cm]?[jt]sx?$/.test(child)) found.add(child);
    }
    return found;
  }
  return new Map(paths.map(path=>{
    const closure = new Set();
    function visit(p) {if (closure.has(p)) return; closure.add(p); for (const next of references(p)) visit(next);}
    visit(path); return [path,[...closure]];
  }));
}

// Semantic dependencies drive selection. Fingerprint inputs deliberately stay
// broader; narrowing scheduling must never weaken source mutation detection.
export function selectChangedTests(root, catalog, paths) {
  const ids = new Set(), full = new Set(), reasons = [];
  const graph = dependencyInputs(root,catalog.tests.map(t=>t.path));
  for (const path of paths) {
    const ownTest = catalog.tests.find(t => t.path === path);
    if (ownTest) { ids.add(ownTest.id); reasons.push({path, reason: 'Changed registered test.'}); continue; }
    let known = false;
    for (const rule of catalog.risks) if (rule.paths.some(p => matchesInput(path, p))) {
      for (const component of rule.components) full.add(component);
      reasons.push({path, reason: rule.reason}); known = true;
    }
    for (const item of catalog.tests) {
      if (item.selectionInputs.some(p => matchesInput(path,p))) {ids.add(item.id); known=true;}
      if (graph.get(item.path).some(p => matchesInput(path,p))) ids.add(item.id);
    }
    if (!known) {
      const components = Object.entries(catalog.components).filter(([, c]) => matchesInput(path, c.directory)).map(([id]) => id);
      const owned = path.startsWith('.agents/core/') || path.startsWith('.github/') || ['AGENTS.md', 'README.md', '.gitignore', '.gitattributes', '.agents/ksf', '.agents/ksf.ps1'].includes(path);
      if (owned) {
        for (const component of components.length ? components : Object.keys(catalog.components)) full.add(component);
        reasons.push({path, reason: 'Unmapped owned input: require full component verification.'});
      }
    }
  }
  for (const t of catalog.tests) if (full.has(t.owner) || t.covers.some(c => full.has(c))) ids.add(t.id);
  // Shared integrations keep their declared native boundary checks.
  for (const t of catalog.tests) if (ids.has(t.id)) for (const id of t.verification.nativeContracts ?? []) ids.add(id);
  return {ids: [...ids].sort(), requiredFullComponents: [...full].sort(), reasons};
}
