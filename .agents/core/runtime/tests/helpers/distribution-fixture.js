import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildManifest } from '../../src/services/build-manifest.js';
import { buildRelease } from '../../src/distribution/release.js';
import { createArchive } from '../../src/distribution/archive.js';
import { sha256, stableJSON, writeAtomic } from '../../src/distribution/common.js';

export const repository = fileURLToPath(new URL('../../../../../', import.meta.url));
export function git(root, args) {
  const result = spawnSync('/usr/bin/git', ['-C', root, ...args], { encoding: 'utf8', env: {
    ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_TERMINAL_PROMPT: '0',
  } });
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
export async function distributionFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'ksf distribution 测试 ')), root = join(directory, 'core');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(root);
  cpSync(join(repository, '.agents/core'), join(root, '.agents/core'), { recursive: true,
    filter: path => !path.includes('/runtime/packages') && !path.includes('/runtime/tests') });
  cpSync(join(repository, '.agents/bin'), join(root, '.agents/bin'), { recursive: true });
  cpSync(join(repository, 'AGENTS.md'), join(root, 'AGENTS.md'));
  writeFileSync(join(root, '.gitignore'), '/.agents/runtime-data/\n/知识/\n/.agents/core/release.json\n');
  writeAtomic(join(root, '.agents/core/example.txt'), 'first\none\ntwo\nthree\nfour\nfive\nlast\n');
  const version = process.version.slice(1), archiveRoot = `node-v${version}-darwin-arm64`;
  const escapedNode = process.execPath.replace(/'/g, "'\\''");
  const node = Buffer.from(`#!/bin/sh\nif [ "$1" = '--version' ]; then printf 'v${version}\\n'; else exec '${escapedNode}' "$@"; fi\n`);
  const archive = createArchive([{ path: `${archiveRoot}/bin/node`, bytes: node, mode: 0o755 },
    { path: `${archiveRoot}/LICENSE`, bytes: Buffer.from('Fictional runtime fixture license\n'), mode: 0o644 }]);
  const archivePath = `.agents/core/runtime/packages/${archiveRoot}.tar.gz`;
  writeAtomic(join(root, archivePath), archive);
  const build = { schema_version: 1, name: 'ksf-core', version: '0.1.0', runtime: { version, release_channel: 'lts', packages: {
    'darwin-arm64': { archive_path: archivePath, archive_sha256: sha256(archive) },
  } } };
  writeAtomic(join(root, '.agents/core/build.json'), stableJSON(build));
  await buildManifest(root);
  git(root, ['init', '--template=', '--initial-branch=main']);
  git(root, ['config', 'user.name', 'KSF Fixture']); git(root, ['config', 'user.email', 'fixture@example.invalid']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  git(root, ['add', '.agents', 'AGENTS.md', '.gitignore']); git(root, ['commit', '-m', 'Fictional clean Core source']);
  const first = await buildRelease({ root, output: join(directory, 'release-0.1.0') });
  const workspace = join(directory, 'ksf'); cpSync(first.template, workspace, { recursive: true });
  const save = (path, value) => writeAtomic(join(root, path), value);
  const next = async (version = '0.1.1', changes = {}) => {
    build.version = version; save('.agents/core/build.json', stableJSON(build));
    for (const [path, bytes] of Object.entries(changes)) {
      if (bytes === null) rmSync(join(root, path)); else save(path, bytes);
    }
    git(root, ['add', '.agents', 'AGENTS.md']); git(root, ['commit', '-m', `Fictional Core ${version}`]);
    const result = await buildRelease({ root, output: join(directory, `release-${version}`) });
    const index = JSON.parse(readFileSync(join(result.output, 'ksf-core-release.json'), 'utf8'));
    for (const item of Object.values(index.platforms['darwin-arm64'])) item.url = pathToFileURL(join(result.output, item.name)).href;
    const source = join(directory, `feed-${version}.json`); writeAtomic(source, stableJSON(index));
    return { ...result, source, coreArchive: join(result.output, index.platforms['darwin-arm64'].core.name), feed: index };
  };
  const launch = (args, options = {}) => spawnSync('/bin/sh', [join(workspace, '.agents/bin/ksf'), ...args], {
    cwd: tmpdir(), encoding: 'utf8', timeout: 20000,
    env: { ...process.env, PATH: '', KSF_SKIP_AUTO_UPDATE: '1', ...options.env },
  });
  return { directory, root, workspace, first, next, save, launch, build };
}
