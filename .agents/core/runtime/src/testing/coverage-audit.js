import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {loadCatalog, sha256, fail, safePath} from './catalog.js';

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
  function assertions(node, hashes=[]) {
    if (!node || typeof node !== 'object') return hashes;
    if (node.type === 'CallExpression' && /^assert\./.test(text.slice(node.callee.start,node.callee.end))) hashes.push(sha256(JSON.stringify(clean(node))));
    for (const value of Object.values(node)) if (Array.isArray(value)) {for(const child of value)assertions(child,hashes);}
    else if (value && typeof value === 'object') assertions(value,hashes);
    return hashes;
  }
  function visit(node, parents = []) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && /^(?:test|it)(?:\.(?:skip|only|todo))?$/.test(text.slice(node.callee.start,node.callee.end))) {
      const loops = parents.filter(p => ['ForOfStatement','ForInStatement','ForStatement'].includes(p.type)).map(p => clean({left:p.left,right:p.right,init:p.init,test:p.test,update:p.update}));
      result.push({hash:sha256(JSON.stringify([clean(node),loops])),assertions:assertions(node),title:node.arguments[0] ? text.slice(node.arguments[0].start,node.arguments[0].end) : '<unnamed>'});
    }
    for (const value of Object.values(node)) if (Array.isArray(value)) {for (const child of value) visit(child,[...parents,node]);}
    else if (value && typeof value === 'object') visit(value,[...parents,node]);
  }
  visit(parsed.program); return result;
}

export function preservesAssertions(original, current) {
  if (!Array.isArray(original) || !original.length || !Array.isArray(current)) return false;
  const remaining=[...current];
  for(const hash of original){const index=remaining.indexOf(hash);if(index<0)return false;remaining.splice(index,1);}
  return true;
}

// Feature work may change an assertion's expected contract. Keep the original
// inventory and pin the reviewed replacement body; unnamed assertions remain
// mandatory, including repeated occurrences of the same assertion.
export function contractAssertions(update) {
  const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  if (typeof update?.reason !== 'string' || !update.reason.trim() || !hash(update.hash) || !Array.isArray(update.originalAssertions) ||
      !update.originalAssertions.length || !update.originalAssertions.every(hash) || !Array.isArray(update.assertionUpdates))
    fail('TEST_COVERAGE_REDUCED','A contract update requires its reviewed hash, reason and original assertion inventory.');
  const remaining = [...update.originalAssertions], replacements = [];
  for (const change of update.assertionUpdates) {
    const index = remaining.indexOf(change?.before);
    if (index < 0 || !Array.isArray(change.after) || !change.after.length || !change.after.every(hash))
      fail('TEST_COVERAGE_REDUCED','A contract update must replace a named original assertion with explicit executable assertions.');
    remaining.splice(index,1); replacements.push(...change.after);
  }
  return [...remaining,...replacements];
}

// Retired upstream interfaces are not preserved coverage. Keep their original
// ledger entries and require both absent implementation paths and a pinned,
// executable native guard for the retirement adopted by that upstream commit.
export function retirementGuard(root, original, current) {
  const r=original.retiredBy;
  if (!r || !/^[a-f0-9]{40}$/.test(r.commit) || typeof r.reason!=='string' || !r.reason.trim() ||
      !Array.isArray(r.removedPaths) || !r.removedPaths.length || !/^[a-f0-9]{64}$/.test(r.guard?.hash) || !r.guard?.path)
    fail('TEST_COVERAGE_REDUCED','A retirement requires an upstream commit, reason, removed implementation paths and a pinned executable guard.');
  for (const path of r.removedPaths) if (typeof path!=='string' || existsSync(safePath(root,path).full))
    fail('TEST_COVERAGE_REDUCED','A retired interface implementation has reappeared.');
  const guard=current.find(s=>s.hash===r.guard.hash && s.test.path===r.guard.path);
  if (!guard || original.nativePlatforms?.length && (guard.test.verification.lane!=='native' || !original.nativePlatforms.every(p=>guard.test.platforms.includes(p))))
    fail('TEST_COVERAGE_REDUCED','A retirement guard is missing, changed or lacks its original native obligations.');
  return guard;
}

export function auditCoverage(root) {
  const catalog = loadCatalog(root), baseline = JSON.parse(readFileSync(join(root,coverageBaseline),'utf8'));
  const current = catalog.tests.flatMap(t => scenarios(root,t.path).map(s => ({...s,test:t})));
  const available = new Map();
  for (const s of current) {const rows = available.get(s.hash) ?? []; rows.push(s); available.set(s.hash,rows);}
  let preserved = 0, native = 0, amended = 0, updated = 0, retired = 0, retiredNative = 0, supplemental = 0;
  for (const original of baseline.scenarios) {
    if (original.retiredBy) {
      if (original.amendment || original.contractUpdate || original.replacedBy) fail('TEST_COVERAGE_REDUCED','A retired scenario cannot also claim preserved or replaced coverage.');
      retirementGuard(root,original,current);retired++;if(original.nativePlatforms?.length)retiredNative++;
      continue;
    }
    if (original.replacedBy) {
      if (original.amendment || original.contractUpdate) fail('TEST_COVERAGE_REDUCED','A replacement cannot also claim an amendment or contract update.');
      if (!current.some(s => s.title === original.replacedBy)) fail('TEST_COVERAGE_REDUCED', `Missing replacement for ${original.title}.`);
      continue;
    }
    const amendment=original.amendment;
    const contract=original.contractUpdate;
    if (amendment && contract) fail('TEST_COVERAGE_REDUCED','A scenario cannot claim both an additive amendment and a changed contract.');
    if (amendment && (!amendment.reason || !amendment.hash || !amendment.originalAssertions?.length)) fail('TEST_COVERAGE_REDUCED','An additive amendment must preserve the original hash, assertion inventory and reason.');
    const assertions=contract?contractAssertions(contract):amendment?.originalAssertions;
    const candidates = available.get(contract?.hash ?? amendment?.hash ?? original.hash) ?? [];
    const index = candidates.findIndex(s => (!assertions || preservesAssertions(assertions,s.assertions)) && (!original.nativePlatforms?.length || s.test.verification.lane === 'native' && original.nativePlatforms.every(p => s.test.platforms.includes(p))));
    if (index < 0) fail('TEST_COVERAGE_REDUCED', `Missing or weakened baseline scenario: ${original.path}: ${original.title}`);
    candidates.splice(index,1); preserved++; if(amendment)amended++; if(contract)updated++; if (original.nativePlatforms?.length) native++;
  }
  if (baseline.mainline) {
    if (!/^[a-f0-9]{40}$/.test(baseline.mainline.commit) || !Array.isArray(baseline.mainline.scenarios)) fail('TEST_COVERAGE_REDUCED','Invalid supplemental mainline ledger.');
    // The two histories may independently constrain the same amended case.
    // Require multiplicity within each ledger without demanding duplicate runs
    // just because one executable case preserves assertions from both parents.
    const mainAvailable=new Map();
    for(const s of current){const rows=mainAvailable.get(s.hash)??[];rows.push(s);mainAvailable.set(s.hash,rows);}
    for (const original of baseline.mainline.scenarios) {
      const amendment=original.amendment;
      if(amendment && (!amendment.reason || !/^[a-f0-9]{64}$/.test(amendment.hash) || !amendment.originalAssertions?.length))fail('TEST_COVERAGE_REDUCED','A mainline amendment must retain its original assertions and reviewed hash.');
      const candidates=mainAvailable.get(amendment?.hash??original.hash)??[];
      const index=candidates.findIndex(s=>(!amendment || preservesAssertions(amendment.originalAssertions,s.assertions)) && (!original.nativePlatforms?.length || s.test.verification.lane==='native' && original.nativePlatforms.every(p=>s.test.platforms.includes(p))));
      if(index<0)fail('TEST_COVERAGE_REDUCED',`Missing or weakened mainline scenario: ${original.path}: ${original.title}`);
      candidates.splice(index,1);supplemental++;
    }
  }
  return {baseline:baseline.commit, originalFiles:baseline.files, preservedScenarios:preserved,
    reviewedReplacements:baseline.scenarios.filter(s=>s.replacedBy).length, nativeScenarios:native,
    unchangedScenarios:preserved-amended-updated, additiveAmendments:amended, reviewedContractUpdates:updated,
    reviewedRetirements:retired, retiredNativeScenarios:retiredNative,
    supplementalMainlineScenarios:supplemental, mainline:baseline.mainline?.commit??null,
    currentFiles:catalog.tests.length, currentScenarios:current.length,
    sharedFiles:catalog.tests.filter(t=>t.verification.lane==='shared').length,
    windowsFiles:catalog.tests.filter(t=>t.verification.lane==='native'&&t.platforms.includes('win32')).length};
}
