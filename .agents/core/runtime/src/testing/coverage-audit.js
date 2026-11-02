import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {loadCatalog, sha256, fail} from './catalog.js';

export const coverageBaseline = '.agents/core/runtime/testing/coverage-baseline.json';

// Compare executable test ASTs, including the values of surrounding scenario
// loops. Moving a case must preserve its assertions, not just its title/count.
export function scenarios(root, path, text = readFileSync(join(root,path),'utf8')) {
  if (path.endsWith('.ps1')) return [{hash:sha256(text), title:path}];
  const require = createRequire(join(root,'.agents/core/applications/sdk/package.json'));
  const {parseSync} = require('rolldown/utils'), parsed = parseSync(path,text);
  if (parsed.errors.length) fail('TEST_COVERAGE_INVALID', `Cannot parse ${path}.`);
  const clean = value => typeof value === 'bigint' ? {bigint:String(value)} : Array.isArray(value) ? value.map(clean) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().filter(k => !['start','end','raw','loc','range','comments'].includes(k)).map(k => [k,clean(value[k])])) : value;
  const result = [];
  function visit(node, parents = []) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && /^(?:test|it)(?:\.(?:skip|only|todo))?$/.test(text.slice(node.callee.start,node.callee.end))) {
      const loops = parents.filter(p => ['ForOfStatement','ForInStatement','ForStatement'].includes(p.type)).map(p => clean({left:p.left,right:p.right,init:p.init,test:p.test,update:p.update}));
      result.push({hash:sha256(JSON.stringify([clean(node),loops])),title:node.arguments[0] ? text.slice(node.arguments[0].start,node.arguments[0].end) : '<unnamed>'});
    }
    for (const value of Object.values(node)) if (Array.isArray(value)) {for (const child of value) visit(child,[...parents,node]);}
    else if (value && typeof value === 'object') visit(value,[...parents,node]);
  }
  visit(parsed.program); return result;
}

export function auditCoverage(root) {
  const catalog = loadCatalog(root), baseline = JSON.parse(readFileSync(join(root,coverageBaseline),'utf8'));
  const current = catalog.tests.flatMap(t => scenarios(root,t.path).map(s => ({...s,test:t})));
  const available = new Map();
  for (const s of current) {const rows = available.get(s.hash) ?? []; rows.push(s); available.set(s.hash,rows);}
  let preserved = 0, native = 0;
  for (const original of baseline.scenarios) {
    if (original.replacedBy) {
      if (!current.some(s => s.title === original.replacedBy)) fail('TEST_COVERAGE_REDUCED', `Missing replacement for ${original.title}.`);
      continue;
    }
    const candidates = available.get(original.hash) ?? [];
    const index = candidates.findIndex(s => !original.nativePlatforms?.length || s.test.verification.lane === 'native' && original.nativePlatforms.every(p => s.test.platforms.includes(p)));
    if (index < 0) fail('TEST_COVERAGE_REDUCED', `Missing or weakened baseline scenario: ${original.path}: ${original.title}`);
    candidates.splice(index,1); preserved++; if (original.nativePlatforms?.length) native++;
  }
  return {baseline:baseline.commit, originalFiles:baseline.files, preservedScenarios:preserved,
    reviewedReplacements:baseline.scenarios.filter(s=>s.replacedBy).length, nativeScenarios:native,
    currentFiles:catalog.tests.length, currentScenarios:current.length,
    sharedFiles:catalog.tests.filter(t=>t.verification.lane==='shared').length,
    windowsFiles:catalog.tests.filter(t=>t.verification.lane==='native'&&t.platforms.includes('win32')).length};
}
