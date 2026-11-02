import {writeFileSync, rmSync, appendFileSync} from 'node:fs';
import {fail} from './catalog.js';
import {validateVerificationPlan, sameFiles} from './ci-plan.js';

export function validateLayeredCoverage(root, reports, plan, identity) {
  validateVerificationPlan(root,plan,identity);
  const seen = new Set();
  for (const r of reports) {
    const group = plan.groups.find(g => g.id === r?.groupId);
    if (!group || seen.has(group.id)) fail('TEST_PROOF_INVALID','Missing, unexpected or duplicate CI group.');
    seen.add(group.id);
    if (r.planDigest !== plan.digest || r.platform !== group.platform || r.architecture !== group.architecture ||
      r.profile !== group.profile || !r.complete || r.status !== 'passed' || r.suite !== 'full' || r.scope !== 'files' || r.component !== null ||
      r.commandExitCode !== 0 || r.catalogDigest !== identity.catalogDigest || r.sourceDigest !== identity.sourceDigest ||
      r.nodeVersion !== 'v'+identity.runtime.version || JSON.stringify(r.runtime) !== JSON.stringify(identity.runtime) ||
      !Array.isArray(r.changedInputs) || r.changedInputs.length || !r.summary || r.summary.reused || r.summary.failed ||
      r.summary.executed !== group.files.length || r.fixtureError || r.cleanupError ||
      !sameFiles(r.selectedFiles,group.files) || !sameFiles(r.assignedFiles,group.files) ||
      !Array.isArray(r.results) || r.results.some(result => !result || result.status !== 'passed') || !sameFiles(r.results.map(result=>result.path),group.files))
      fail('TEST_PROOF_INVALID','Incomplete, stale, non-native or reused CI group.',{group:group.id});
  }
  if (seen.size !== plan.groups.length) fail('TEST_PROOF_INVALID','CI has missing required shared or native groups.');
  return {schemaVersion:2, policy:plan.policy, ...identity, full:plan.full, planDigest:plan.digest,
    // Carry the complete obligation list; validation recreates it from source.
    groups:plan.groups, platforms:['darwin','win32'], linux:'native-development-core',
    commit:process.env.GITHUB_SHA,repository:process.env.GITHUB_REPOSITORY,
    runId:process.env.GITHUB_RUN_ID,runAttempt:process.env.GITHUB_RUN_ATTEMPT,verifiedAt:new Date().toISOString()};
}

export function aggregateLayeredReports(root, reports, plan, identity, {proofPath,summaryPath}) {
  rmSync(proofPath,{force:true});
  const summary = {schemaVersion:2, complete:false, full:plan.full, planDigest:plan.digest, reports:reports.length,
    groups:plan.groups.map(g => {
      const receipts = reports.filter(r=>r?.groupId===g.id), results = receipts.flatMap(r=>Array.isArray(r.results)?r.results.filter(Boolean):[]);
      return {id:g.id,profile:g.profile,platform:g.platform,expected:g.files.length,reported:results.length,
        passed:results.filter(r=>r.status==='passed').length,missing:g.files.filter(p=>!results.some(r=>r.path===p)),
        failed:results.filter(r=>r.status!=='passed'),errors:receipts.flatMap(r=>r.errors??[]),
        fixturePreparation:receipts.map(r=>r.fixturePreparation).filter(Boolean)};
    }), errors:reports.flatMap(r=>r?.errors??[])};
  let proof;
  try {proof=validateLayeredCoverage(root,reports,plan,identity);summary.complete=true;}
  catch(error) {summary.error={code:error.code??'TEST_PROOF_INVALID',message:error.message};throw error;}
  finally {
    writeFileSync(summaryPath,JSON.stringify(summary,null,2)+'\n');
    if(process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      ['## Shared and native coverage','',...summary.groups.map(g=>`- ${g.id} (${g.profile}, ${g.platform}): ${g.passed}/${g.expected} passed; ${g.missing.length} missing; ${g.failed.length} failed.`),...(summary.error?['',summary.error.message]:[])].join('\n')+'\n');
  }
  // Impact verification is useful evidence, but never a release certificate.
  if (plan.full) writeFileSync(proofPath,JSON.stringify(proof,null,2)+'\n');
  return proof;
}
