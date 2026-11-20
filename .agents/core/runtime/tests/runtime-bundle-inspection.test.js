import assert from 'node:assert/strict';
import {test} from 'node:test';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import {buildRelease,inspectCoreArchive} from '../src/distribution/release.js';
import {createArchive} from '../src/distribution/archive.js';
import {sha256,stableJSON} from '../src/shared/hash.js';
import {fixtureTarget} from './helpers/distribution-fixture.js';
import YAML from '../src/vendor/yaml/dist/index.js';
import {multi,inspect} from './helpers/runtime-bundle-fixture.js';

test('bundle inspection rejects foreign archives, missing archives and expanded runtime manifests even with refreshed checksums',async t=>{
  const f=await multi(t),result=await buildRelease({root:f.root,platform:fixtureTarget,output:join(f.directory,'inspect-one')});
  const good=inspect(result,fixtureTarget),native=f.build.runtime.packages[fixtureTarget].archive_path;
  const other=fixtureTarget==='win32-x64'?'darwin-arm64':'win32-x64',foreign=f.build.runtime.packages[other].archive_path;
  function changed(mutate){const manifest=structuredClone(good.manifest),entries=new Map([...good.entries].map(([path,file])=>[path,{...file,bytes:Buffer.from(file.bytes)}]));mutate(entries,manifest);entries.set('.agents/core/release.json',{bytes:Buffer.from(stableJSON(manifest)),mode:0o644});return createArchive([...entries].map(([path,file])=>({path,...file})));}
  const addForeign=changed((entries,manifest)=>{const bytes=readFileSync(join(f.root,foreign));entries.set(foreign,{bytes,mode:0o644});manifest.files[foreign]={sha256:sha256(bytes),mode:0o644,source_path:foreign};});
  assert.throws(()=>inspectCoreArchive(addForeign),{code:'RELEASE_INVALID'});
  assert.throws(()=>inspectCoreArchive(changed((entries,manifest)=>{entries.delete(native);delete manifest.files[native];})),{code:'RELEASE_INVALID'});
  assert.throws(()=>inspectCoreArchive(changed((entries,manifest)=>{const path='.agents/core/manifest.yaml',value=YAML.parse(entries.get(path).bytes.toString());value.runtime.packages[other]=value.runtime.packages[fixtureTarget];const bytes=Buffer.from(YAML.stringify(value));entries.set(path,{bytes,mode:0o644});manifest.files[path].sha256=sha256(bytes);})),{code:'RELEASE_INVALID'});
  assert.throws(()=>inspectCoreArchive(changed((entries,manifest)=>{const path='.agents/core/manifest.yaml',value=YAML.parse(entries.get(path).bytes.toString());value.runtime.packages[fixtureTarget]=null;const bytes=Buffer.from(YAML.stringify(value));entries.set(path,{bytes,mode:0o644});manifest.files[path].sha256=sha256(bytes);})),{code:'RELEASE_INVALID'});
});
