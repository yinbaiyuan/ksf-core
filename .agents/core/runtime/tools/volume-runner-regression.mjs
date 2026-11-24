// Exercise the actual runner after the same-machine volume hypothesis passed.
// This selected-file diagnostic cannot satisfy a release's full-suite proof.
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {join,parse} from 'node:path';
import {sourceIdentity} from '../src/testing/ci.js';
import {createVerificationPlan} from '../src/testing/ci-plan.js';
import {createTestPlan} from '../src/testing/planner.js';
import {executeTestPlan,testTemporaryParent} from '../src/testing/runner.js';
import {prepareCIFixtures} from '../src/testing/prepare-ci-fixtures.js';

const local=process.argv.slice(2).join(' ')==='--local-check';
assert(local||process.argv.length===2);assert(local||process.platform==='win32');
const root=realpathSync(process.cwd()),out=join(root,'.agents/runtime-data/volume-diagnostic'),seeds=join(root,'.agents/runtime-data/ci-seeds');
assert(!existsSync(out)&&!existsSync(seeds),'Never overwrite another diagnostic or preparation.');mkdirSync(out,{recursive:true});
const identity=sourceIdentity(root),full=createVerificationPlan(root,{full:true},identity),runId=process.env.GITHUB_RUN_ID??'local-runner-regression-not-proof',runAttempt=process.env.GITHUB_RUN_ATTEMPT??'1';
const counts={'testing.test.js':18,'testing-ci.test.js':13,'distribution-fixture.test.js':2,'system-update-io-recovery.test.js':4,'system-update-root-interruption.test.js':3,'instance-initialization-recovery-crashes.test.js':2,'system-update-recovery.test.js':4};
const plan=createTestPlan(root,{suite:'full',files:Object.keys(counts).map(n=>'.agents/core/runtime/tests/'+n)});
assert.equal(plan.tests.length,7);assert.deepEqual(plan.missingDependencies,[]);
if(!local)assert.equal(parse(testTemporaryParent(root)).root.toLowerCase(),parse(root).root.toLowerCase());
const diagnostics={diagnosticOnly:true,notSuiteProof:true,sourceDigest:identity.sourceDigest,baseline:null,report:null};
const save=()=>writeFileSync(join(out,'results.json'),JSON.stringify(diagnostics,null,2)+'\n');save();let owned=false;
try{
 owned=true;prepareCIFixtures(root,{include:full.groups.filter(g=>g.platform===process.platform&&g.toolchains===false)},{runId,runAttempt});
 const options={preparedFixtures:{directory:seeds,identity,runId,runAttempt}};
 // On a new runner, obtain one fresh baseline with only the checkout-location
 // selector disabled. No other source, environment, fixture or rule changes.
 if(!local){
  const workspace=process.env.GITHUB_WORKSPACE;
  try{
   process.env.GITHUB_WORKSPACE='';
   const baselinePlan=createTestPlan(root,{suite:'full',files:['.agents/core/runtime/tests/system-update-recovery.test.js']});
   const baseline=await executeTestPlan(root,baselinePlan,options);diagnostics.baseline=baseline.result;save();assert(baseline.ok);
   const item=baseline.result.results[0];assert.equal(item.counts.tests,4);assert.equal(item.counts.passed,4);for(const key of ['failed','cancelled','skipped','todo'])assert.equal(item.counts[key],0);
   assert.equal(baseline.result.cleanupError,null);assert(!existsSync(baseline.result.temporaryDirectory));
  }finally{if(workspace===undefined)delete process.env.GITHUB_WORKSPACE;else process.env.GITHUB_WORKSPACE=workspace;}
 }
 const {ok,result}=await executeTestPlan(root,plan,options);diagnostics.report=result;save();
 assert(ok,JSON.stringify({status:result.status,fixtureError:result.fixtureError,cleanupError:result.cleanupError,failed:result.results.filter(r=>r.status!=='passed')}));
 assert.equal(result.summary.reused,0);assert.equal(result.summary.failed,0);assert.deepEqual(result.changedInputs,[]);assert.equal(result.cleanupError,null);assert(!existsSync(result.temporaryDirectory));
 if(!local)assert.equal(parse(result.temporaryDirectory).root.toLowerCase(),parse(root).root.toLowerCase());
 for(const item of result.results){const name=item.path.split('/').at(-1);assert.equal(item.counts.tests,counts[name],name);assert.equal(item.counts.passed,counts[name],name);for(const key of ['failed','cancelled','skipped','todo'])assert.equal(item.counts[key],0,name+': '+key);}
 assert.equal(sourceIdentity(root).sourceDigest,identity.sourceDigest);console.log(JSON.stringify({nativeSelectedFiles:7,scenarios:46,additionalBaselineScenarios:local?0:4,temporaryDirectory:result.temporaryDirectory,cleaned:true,scope:result.scope,fullSuiteProof:false}));
}finally{if(owned)rmSync(seeds,{recursive:true,force:true,maxRetries:8,retryDelay:50});}
