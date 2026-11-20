import assert from 'node:assert/strict';
import {test} from 'node:test';
import {join} from 'node:path';
import {existsSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {buildRelease,inspectCoreArchive} from '../src/distribution/release.js';
import {buildManifest} from '../src/services/build-manifest.js';
import {inspectReleaseDirectory} from '../src/distribution/publish.js';
import {installedManifest} from '../src/distribution/manifests.js';
import {resolveBaseline} from '../src/distribution/baseline.js';
import {systemRead} from '../src/distribution/system.js';
import {runtimePackage} from '../src/platform/catalog.js';
import {runtimePackagesPath} from '../src/platform/runtime-bundle.js';
import {sha256,stableJSON} from '../src/shared/hash.js';
import {fixtureTarget,commitWorkspace,contributionDescription} from './helpers/distribution-fixture.js';
import {ForkAPI} from './helpers/contribution-api.js';
import {prepareContribution} from '../src/distribution/contribute.js';
import YAML from '../src/vendor/yaml/dist/index.js';

import {multi,freeze,inspect} from './helpers/runtime-bundle-fixture.js';

test('each platform artifact contains one runtime; source inputs and complete publication targets remain intact',async t=>{
  const f=await multi(t),sourceBuild=readFileSync(join(f.root,'.agents/core/build.json'));
  // Retaining previous Node archives in source must not expand release scope.
  const previous=runtimePackagesPath+runtimePackage(fixtureTarget,'24.20.0').filename;
  f.save(previous,Buffer.from('retained previous runtime'));await freeze(f,'Retain an older runtime archive');
  const result=await buildRelease({root:f.root,output:join(f.directory,'target-bundles')});
  assert.deepEqual(result.platforms,['darwin-arm64','win32-x64']);
  for(const target of result.platforms){
    const {entries,manifest}=inspect(result,target),archive=f.build.runtime.packages[target].archive_path;
    assert.deepEqual([...entries.keys()].filter(path=>path.startsWith(runtimePackagesPath)),[archive]);
    assert.deepEqual(entries.get('.agents/core/build.json').bytes,sourceBuild);
    assert.deepEqual(Object.keys(YAML.parse(entries.get('.agents/core/manifest.yaml').bytes.toString()).runtime.packages),[target]);
    assert.equal(manifest.core.revision,result.coreRevision);
    assert.equal(sha256(entries.get(archive).bytes),f.build.runtime.packages[target].archive_sha256);
  }
  assert.equal(inspectReleaseDirectory(f.root,result.output).artifacts.length,4);
  assert.deepEqual(readFileSync(join(f.root,'.agents/core/build.json')),sourceBuild);
  for(const item of Object.values(f.build.runtime.packages))assert.ok(existsSync(join(f.root,item.archive_path)));
  // A release can regenerate its manifest without any foreign runtime archives.
  rmSync(join(result.instance,'.agents/core/manifest.yaml'));
  const rebuilt=await buildManifest(result.instance);
  assert.deepEqual(Object.keys(rebuilt.manifest.runtime.packages),[installedManifest(result.instance).platform]);
  const api=new ForkAPI({coreRoot:f.root}),status=await systemRead({root:result.instance,api});
  assert.deepEqual(status.changes,[]);
  const compact=await resolveBaseline(installedManifest(result.instance),{api});
  assert.deepEqual(Object.keys(compact.files).filter(path=>path.startsWith(runtimePackagesPath)),[f.build.runtime.packages[installedManifest(result.instance).platform].archive_path]);
  const templateReceipt={...installedManifest(result.instance),schema_version:5,origin:'core-template'};
  const template=await resolveBaseline(templateReceipt,{api});
  assert.equal(Object.keys(template.files).filter(path=>path.startsWith(runtimePackagesPath)).length,4);
  assert.ok(template.files[previous]);
  // Baseline selection uses the pinned source declaration, not mutable local data.
  const localBuild=JSON.parse(readFileSync(join(result.instance,'.agents/core/build.json')));
  localBuild.runtime.version='24.20.0';
  writeFileSync(join(result.instance,'.agents/core/build.json'),stableJSON(localBuild));
  assert.deepEqual(Object.keys((await resolveBaseline(installedManifest(result.instance),{api})).files).filter(path=>path.startsWith(runtimePackagesPath)),[f.build.runtime.packages[installedManifest(result.instance).platform].archive_path]);
  writeFileSync(join(result.instance,'.agents/core/build.json'),sourceBuild);
  const originalRequest=api.request.bind(api);
  api.request=async(method,path,body)=>{
    const response=await originalRequest(method,path,body);
    if(path.includes('/git/blobs/'))return {...response,content:Buffer.from('tampered declaration').toString('base64')};
    return response;
  };
  await assert.rejects(resolveBaseline(installedManifest(result.instance),{api}),{code:'BASELINE_MISMATCH'});
  api.request=originalRequest;
  commitWorkspace({...f,workspace:result.instance});
  await assert.rejects(prepareContribution({...contributionDescription,root:result.instance,all:true,api}),{code:'CONTRIBUTION_EMPTY'});
});
