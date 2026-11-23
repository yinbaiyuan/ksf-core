import {loadCatalog, sha256, fail, rebuiltArtifact} from './catalog.js';
import {changedPaths, assignShards} from './planner.js';
import {selectChangedTests} from './selection.js';

export const targets = [
  {target:'shared-linux', profile:'shared', platform:'linux', architecture:'x64', os:'ubuntu-24.04', prepared:'Linux', limit:3},
  {target:'shared', profile:'shared', platform:'darwin', architecture:'arm64', os:'xcode-27', prepared:'macOS', limit:1},
  {target:'mac', profile:'native', platform:'darwin', architecture:'arm64', os:'xcode-27', prepared:'macOS', limit:4},
  {target:'win', profile:'native', platform:'win32', architecture:'x64', os:'windows-2025', prepared:'Windows', limit:12},
  {target:'linux22', profile:'native', platform:'linux', architecture:'x64', os:'ubuntu-22.04', prepared:null, limit:1},
  {target:'linux24', profile:'native', platform:'linux', architecture:'x64', os:'ubuntu-24.04', prepared:null, limit:1},
];
// Portable shared obligations use Linux once. Formal publisher fixtures that
// require an official target stay on Mac, alongside every native Mac contract.
// Three shared, five Mac and twelve Windows workers fit the hosted budget.
export const verificationTargets = full => full
  ? [targets[0],{...targets[2],profile:'all',limit:5},...targets.slice(3)]
  : targets;
export const assignedToTarget = (test,target) =>
  (target.profile==='all'||test.verification.lane===target.profile)&&test.platforms.includes(target.platform)&&
  !(test.verification.lane==='shared'&&target.platform==='darwin'&&test.platforms.includes('linux'));
export const planDigest = plan => {const {digest, ...content} = plan; return sha256(JSON.stringify(content));};
export const sameFiles = (a,b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

export function createVerificationPlan(root, {full = false, base, changes} = {}, identity) {
  const catalog = loadCatalog(root);
  if (catalog.schemaVersion !== 2) fail('TEST_CI_PLAN_INVALID', 'Layered CI requires a reviewed schema-2 catalog.');
  const diff = full ? null : changes ?? changedPaths(root, base);
  if (diff) diff.paths = diff.paths.filter(p => !rebuiltArtifact(p) && (/^(?:\.agents\/core\/|\.github\/)/.test(p) || ['.agents/ksf','.agents/ksf.ps1','AGENTS.md','README.md','.gitignore','.gitattributes'].includes(p)));
  const selection = full ? null : selectChangedTests(root, catalog, diff.paths);
  const selected = catalog.tests.filter(t => full || selection.ids.includes(t.id));
  const groups = [];
  for (const target of verificationTargets(full)) {
    const tests = selected.filter(t => assignedToTarget(t,target));
    if (!tests.length) continue;
    const seconds = tests.reduce((sum,t) => sum + (t.seconds?.[target.platform] ?? 1), 0);
    const count = Math.min(tests.length, target.limit, Math.max(1, Math.ceil(seconds / 450)));
    for (const [index, files] of assignShards(tests, count, target.platform).entries()) groups.push({
      id:`${target.target}-${index + 1}`, target:target.target, profile:target.profile,
      platform:target.platform, architecture:target.architecture, os:target.os, prepared:target.prepared,
      files:files.map(t => t.path), estimatedSeconds:Math.round(files.reduce((sum,t) => sum + (t.seconds?.[target.platform] ?? 1),0)),
    });
  }
  const plan = {schemaVersion:2, policy:'shared-once-native-boundaries-v2', full,
    ...identity, base:diff?.base ?? null, head:diff?.head ?? null, changes:diff?.paths ?? [],
    reasons:selection?.reasons ?? [{reason:'Complete shared and native verification requested.'}],
    selectedIds:selected.map(t => t.id).sort(), groups};
  return {...plan, digest:planDigest(plan)};
}

// Recreate the plan, rather than trusting artifact-provided file lists. PR
// changes must also still match Git's common ancestor and final source.
export function validateVerificationPlan(root, plan, identity) {
  if (!plan || plan.schemaVersion !== 2 || plan.digest !== planDigest(plan)) fail('TEST_CI_PLAN_INVALID', 'Missing or tampered CI plan.');
  const expected = createVerificationPlan(root, {full:plan.full, base:process.env.KSF_TEST_BASE || plan.base || undefined}, identity);
  if (expected.digest !== plan.digest) fail('TEST_CI_PLAN_INVALID', 'CI plan does not match the source, base, catalog or required target coverage.');
  return plan;
}
