import {loadCatalog, sha256, fail, rebuiltArtifact} from './catalog.js';
import {changedPaths, assignShards, scheduledSeconds} from './planner.js';
import {selectChangedTests} from './selection.js';

// Reviewed native transaction files use only the bundled runtime and their
// independent distribution fixtures. All other files retain full toolchains.
export const runtimeOnlyNative = new Set([
  "core:compact-baseline",
  "core:lifecycle",
  "core:system-development-paths",
  "core:system-update-interruption",
  "core:system-update-io-recovery",
  "core:system-update-recovery",
  "core:system-update-root-candidates",
  "core:system-update-root-conflicts",
  "core:system-update-root-interruption",
  "core:system-update-roots",
  "core:system-update",
  "core:instance-initialization",
  "core:instance-reclone",
  "core:instance-reclone-recovery",
  "core:instance-reclone-branches",
  "core:instance-initialization-recovery",
  "core:instance-initialization-guards",
  "core:instance-initialization-branches",
  "core:instance-initialization-recovery-branches",
  "core:instance-initialization-recovery-crashes",
  "core:instance-source-promotion",
  "core:system-update-preservation",
  "core:system-update-validation",
  "core:runtime-bundle",
  "core:runtime-bundle-inspection",
  "core:runtime-bundle-upgrade",
  "core:runtime-bundle-native",
  "core:distribution-native",
  "core:contribute-native",
  "core:distribution-fixture",
  "core:system-update-applications",
  "core:system-update-applications-recovery"
]);
export const runtimeOnlyTest = test => runtimeOnlyNative.has(test.id);
export const targets = [
  {target:'shared-linux',profile:'shared',platform:'linux',architecture:'x64',os:'ubuntu-24.04',prepared:'Linux',toolchains:true,limit:3},
  {target:'mac-runtime',profile:'native',platform:'darwin',architecture:'arm64',os:'xcode-27',prepared:'macOS-runtime',toolchains:false,limit:3},
  {target:'mac',profile:'all',platform:'darwin',architecture:'arm64',os:'xcode-27',prepared:'macOS',toolchains:true,limit:2},
  {target:'win-runtime',profile:'native',platform:'win32',architecture:'x64',os:'windows-2025',prepared:'Windows-runtime',toolchains:false,limit:9},
  {target:'win',profile:'native',platform:'win32',architecture:'x64',os:'windows-2025',prepared:'Windows',toolchains:true,limit:3},
  {target:'linux22',profile:'native',platform:'linux',architecture:'x64',os:'ubuntu-22.04',prepared:null,toolchains:true,limit:2},
  {target:'linux24',profile:'native',platform:'linux',architecture:'x64',os:'ubuntu-24.04',prepared:null,toolchains:true,limit:2},
];
// Five Mac and twelve Windows workers retain their native contracts. Runtime
// transactions start independently of frontend dependency/build preparation.
export const verificationTargets = () => targets;
export const assignedToTarget = (test,target) =>
  (target.profile==='all'||test.verification.lane===target.profile)&&test.platforms.includes(target.platform)&&
  !(test.verification.lane==='shared'&&target.platform==='darwin'&&test.platforms.includes('linux'))&&
  (target.platform==='linux'||(target.toolchains===false?runtimeOnlyTest(test):!runtimeOnlyTest(test)));
export const planDigest = plan => {const {digest, ...content} = plan; return sha256(JSON.stringify(content));};
export const sameFiles = (a,b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

export function createVerificationPlan(root, {full = false, base, changes} = {}, identity) {
  const catalog = loadCatalog(root);
  if (catalog.schemaVersion !== 2) fail('TEST_CI_PLAN_INVALID', 'Layered CI requires a reviewed schema-2 catalog.');
  const diff = full ? null : changes ?? changedPaths(root, base);
  if (diff) diff.paths = diff.paths.filter(p => !rebuiltArtifact(p) && (/^(?:\.agents\/core\/|\.github\/)/.test(p) || ['.agents/ksf','.agents/ksf.ps1','AGENTS.md','README.md','.gitignore','.gitattributes'].includes(p)));
  const selection = full ? null : selectChangedTests(root, catalog, diff.paths);
  const selected = catalog.tests.filter(t => full || selection.ids.includes(t.id));
  for(const test of selected)if(runtimeOnlyTest(test)&&(
    test.verification.lane!=='native'||test.isolation!=='exclusive'||test.fixtures?.join(',')!=='distribution'||test.requirements?.length))
    fail('TEST_CI_PLAN_INVALID','Runtime-only native files must retain their reviewed isolation, distribution fixture and dependency-free contract.',{target:test.path});
  const groups = [];
  for (const target of verificationTargets(full)) {
    const tests = selected.filter(t => assignedToTarget(t,target));
    if (!tests.length) continue;
    const seconds = tests.reduce((sum,t) => sum + (t.seconds?.[target.platform] ?? 1), 0);
    // Finish development-only native Linux obligations early, before the
    // steady Mac/Windows/shared pool needs the hosted concurrency slots.
    const targetSeconds=target.platform==='linux'&&target.profile==='native'?180:450;
    // Retain the reviewed nine-worker full transaction pool after faster
    // fixtures lower its summed estimates; affected-only plans stay adaptive.
    const count = full && target.target==='win-runtime' ? Math.min(tests.length,target.limit) : Math.min(tests.length, target.limit, Math.max(1, Math.ceil(seconds / targetSeconds)));
    const profile=target.profile==='all'&&tests.every(t=>t.verification.lane==='native')?'native':target.profile;
    for (const [index, files] of assignShards(tests, count, target.platform).entries()) groups.push({
      id:`${target.target}-${index + 1}`, target:target.target, profile,
      platform:target.platform, architecture:target.architecture, os:target.os, prepared:target.prepared, toolchains:target.toolchains,
      files:files.map(t => t.path), estimatedSeconds:Math.ceil(scheduledSeconds(files,target.platform)),
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
