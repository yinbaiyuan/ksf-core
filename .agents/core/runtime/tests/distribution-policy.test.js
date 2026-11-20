import assert from 'node:assert/strict';
import {test} from 'node:test';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createArchive,readArchive} from '../src/distribution/archive.js';
import {compareVersions,isBranch} from '../src/distribution/common.js';
test('release archive round-trips UTF-8 paths, content and executable modes', () => {
  const path = '.agents/core/' + 'long-directory/'.repeat(10) + '中文.js';
  const bytes = createArchive([{ path, bytes: Buffer.from('hello\n'), mode: 0o755 }]);
  const file = readArchive(bytes).get(path);
  assert.equal(file.bytes.toString(), 'hello\n'); assert.equal(file.mode, 0o755);
});

for (const path of ['../outside', '/absolute', '.agents/core/../outside', '.agents/core//file', '.git/config', '.agents/core/evil\\path', 'C:/outside']) {
  test(`archive builder rejects escaping path ${JSON.stringify(path)}`, () => {
    assert.throws(() => createArchive([{ path, bytes: Buffer.alloc(0) }]), { code: 'ARCHIVE_INVALID' });
  });
}

test('archive reader rejects tampered checksums, links and duplicate members', () => {
  const good = createArchive([{ path: '.agents/core/test', bytes: Buffer.from('x') }]);
  const wrong = gunzipSync(good); wrong[0] ^= 1;
  assert.throws(() => readArchive(gzipSync(wrong)), { code: 'ARCHIVE_INVALID' });
  const link = gunzipSync(good); link[156] = 50; link.fill(32, 148, 156);
  const sum = link.subarray(0, 512).reduce((a, b) => a + b, 0);
  link.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  assert.throws(() => readArchive(gzipSync(link)), { code: 'ARCHIVE_INVALID' });
  const original = gunzipSync(good), duplicate = Buffer.concat([original.subarray(0, 1024), original]);
  assert.throws(() => readArchive(gzipSync(duplicate)), { code: 'ARCHIVE_INVALID' });
});

test('versions compare numerically and respect prerelease precedence', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0-rc.1'), 1);
  assert.equal(compareVersions('1.0.0-rc.10', '1.0.0-rc.2'), 1);
  assert.equal(compareVersions('0.1.0', '0.1.0'), 0);
  assert.throws(() => compareVersions('01.2.3', '1.2.3'), { code: 'VERSION_INVALID' });
});

test('Core accepts ordinary branch names while rejecting invalid refs', () => {
  for (const branch of ['main', 'feature/project-cli', 'fix/修复', 'feature/nested/task']) assert.equal(isBranch(branch), true, branch);
  for (const branch of ['', '@', '-main', '../main', 'main..old', '/main', 'main/', 'main//fix', 'main.lock', '.hidden', 'main.', 'main@{1}', 'bad branch', 'bad\\branch', 'bad[branch']) assert.equal(isBranch(branch), false, branch);
});

test('M4 reads historical mirror inventories and retires their paths during Core upgrade without treating local edits as new managed payloads',async()=>{
 const {mkdtempSync,mkdirSync,writeFileSync,rmSync}=await import('node:fs'),{join,dirname}=await import('node:path'),{tmpdir}=await import('node:os');const {validateManifest}=await import('../src/distribution/manifests.js'),{planUpdate}=await import('../src/distribution/system.js'),{sha256}=await import('../src/shared/hash.js'),{managedPath}=await import('../src/distribution/paths.js');const root=mkdtempSync(join(tmpdir(),'ksf-retired-mirror-'));
 try{const files={},paths=['.agents/core/applications/store/index.json','.agents/core/ability-store/index.json','.agents/core/applications/terminal/backend.mjs'];for(const path of paths){mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),'local preserved in transaction backup');files[path]={sha256:sha256('old release'),mode:420,source_path:path};assert.equal(managedPath(path),false);}
 const plan=await planUpdate(root,{files,read:async()=>Buffer.from('old release')},{files:{}},new Map());assert.deepEqual(plan.conflicts,[]);for(const path of paths)assert.equal(plan.files.get(path),null);
 // Historical release manifests remain readable; future inventory uses managedPath.
 const historical={schema_version:3,launcher_protocol:1,name:'ksf-core',product:'ksf-core',version:'0.5.6',platform:'darwin-arm64',core:{repository:'alice/core',revision:'a'.repeat(40),branch:'main'},development:false,files:{...files}};for(const path of ['AGENTS.md','.agents/ksf','.agents/ksf.ps1','.agents/core/build.json','.agents/core/data-compatibility.json','.agents/core/manifest.yaml','.agents/core/distribution.json'])historical.files[path]={sha256:sha256('content'),mode:path==='.agents/ksf'?493:420,source_path:path};assert.doesNotThrow(()=>validateManifest(historical));
 }finally{rmSync(root,{recursive:true,force:true});}
});
