import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sourceIdentity} from './ci.js';
import {loadCatalog,fail} from './catalog.js';
import {fixtureDigest} from './fixtures.js';

export function prepareCIFixtures(root,groups,{runId=process.env.GITHUB_RUN_ID,runAttempt=process.env.GITHUB_RUN_ATTEMPT}={}) {
  root=resolve(root);
  if(!runId||!runAttempt)fail('TEST_CI_PREPARATION_INVALID','Distribution preparation requires the current CI attempt.');
  const catalog=loadCatalog(root),files=new Set(groups.include.flatMap(g=>g.files));
  const directory=join(root,'.agents/runtime-data/ci-seeds');
  mkdirSync(join(root,'.agents/runtime-data'),{recursive:true});mkdirSync(directory);
  const consumers=catalog.tests.filter(t=>files.has(t.path)&&t.fixtures?.includes('distribution'));
  if(!consumers.length){writeFileSync(join(directory,'prepared.json'),JSON.stringify({schemaVersion:1,complete:true,empty:true}));return {empty:true};}
  const identity=sourceIdentity(root),payload=join(directory,'payload');mkdirSync(payload);
  const result=spawnSync(process.execPath,[join(root,'.agents/core/runtime/tests/helpers/prepare-distribution.mjs'),join(payload,'manifest.json'),payload],{
    cwd:root,encoding:'utf8',timeout:180000,windowsHide:true,
    env:{...process.env,TMPDIR:payload,TMP:payload,TEMP:payload},maxBuffer:8*1024*1024,
  });
  if(result.status!==0)fail('TEST_FIXTURE_PREPARATION_FAILED','Platform distribution preparation failed: '+(result.stderr??result.error?.message??'').slice(-3000));
  if(sourceIdentity(root).sourceDigest!==identity.sourceDigest)fail('TEST_INPUT_CHANGED','Source changed while preparing distribution fixtures.');
  const metadata={schemaVersion:1,complete:true,...identity,platform:process.platform,architecture:process.arch,node:process.execPath,repository:root,runId:String(runId),runAttempt:String(runAttempt),digest:fixtureDigest(payload)};
  writeFileSync(join(directory,'prepared.json'),JSON.stringify(metadata)+'\n');return {empty:false,digest:metadata.digest,consumerFiles:consumers.length};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  try {console.log(JSON.stringify(prepareCIFixtures(process.cwd(),JSON.parse(process.env.KSF_CI_GROUPS))));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
