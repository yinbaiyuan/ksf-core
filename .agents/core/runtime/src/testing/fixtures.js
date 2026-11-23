import {readdirSync, readFileSync, lstatSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {sha256, fail, safePath} from './catalog.js';

// Include Git objects, indices and modes. A consumer may only copy a seed; a
// successful assertion cannot excuse changing another scenario's baseline.
export function fixtureDigest(directory) {
  const records = [];
  function visit(path, prefix = '') {
    for (const name of readdirSync(path).sort()) {
      const full = join(path,name), rel = prefix + name, stat = lstatSync(full);
      if (stat.isDirectory()) visit(full,rel+'/');
      else if (stat.isFile()) records.push([rel,stat.mode & 0o777,sha256(readFileSync(full))]);
      else fail('TEST_FIXTURE_INVALID','Seed trees must contain independent regular files.');
    }
  }
  visit(directory); return sha256(JSON.stringify(records));
}

// CI may transport a seed produced by this exact source and Actions run.
// It is not a result cache: every scenario still runs against independent copies.
export function readPreparedFixtures(root,{directory,identity,runId,runAttempt}) {
  const invalid=()=>fail('TEST_CI_PREPARATION_INVALID','Prepared distribution fixtures do not match this source, runtime and CI attempt.');
  const base=safePath(root,directory).full,payload=join(base,'payload');
  const metadata=JSON.parse(readFileSync(join(base,'prepared.json'),'utf8'));
  const producer=Number(metadata.runAttempt),consumer=Number(runAttempt);
  if(metadata.schemaVersion!==1||metadata.complete!==true||metadata.platform!==process.platform||metadata.architecture!==process.arch||metadata.node!==process.execPath||resolve(metadata.repository)!==resolve(root)||metadata.runId!==String(runId)||!runId||!Number.isSafeInteger(producer)||producer<1||!Number.isSafeInteger(consumer)||consumer<producer||metadata.sourceDigest!==identity.sourceDigest||metadata.catalogDigest!==identity.catalogDigest||JSON.stringify(metadata.runtime)!==JSON.stringify(identity.runtime))invalid();
  const seedPath=join(payload,'manifest.json'),manifest=JSON.parse(readFileSync(seedPath,'utf8'));
  if(manifest.schemaVersion!==1||manifest.platform!==process.platform||manifest.node!==process.execPath||resolve(manifest.repository)!==resolve(root))invalid();
  for(const key of ['true','false']) {
    const seed=manifest.seeds?.[key];
    for(const path of [seed?.directory,seed?.root,seed?.workspace,seed?.first?.output]) {
      if(typeof path!=='string')invalid();
      const rel=relative(payload,resolve(path));
      if(!rel||rel.startsWith('..')||isAbsolute(rel))invalid();
      safePath(root,path);
    }
  }
  const digest=fixtureDigest(payload);if(digest!==metadata.digest)invalid();
  return {seedPath,seedDirectory:payload,digest,preparedAttempt:String(producer)};
}
