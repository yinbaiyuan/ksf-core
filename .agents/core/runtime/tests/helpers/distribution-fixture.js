import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildManifest } from '../../src/services/build-manifest.js';
import { buildRelease, inspectCoreArchive } from '../../src/distribution/release.js';
import { createArchive } from '../../src/distribution/archive.js';
import { sha256, stableJSON, writeAtomic, fileMode } from '../../src/distribution/common.js';

export const repository = fileURLToPath(new URL('../../../../../', import.meta.url));
export const contributionDescription = {
  title: 'fix(core): 修正选定系统文件的示例行为',
  body: '原因：\n选定系统文件与预期行为不符。\n\n变更：\n- 修正选定系统文件的示例行为。\n\n验证：\n- 未执行：这里只构造隔离的贡献测试数据，不代表真实系统验证。\n',
  prBody: '## 背景与目的\n选定系统文件与预期行为不符，需恢复约定行为。\n\n## 主要变更\n- 修正示例行为，并保留当前贡献边界。\n\n## 验证结果\n- 未执行：这里只构造隔离贡献数据，不代表真实系统验证。\n\n## 影响与兼容\n本例不更换 CLI 或数据格式；实际兼容性由测试场景核对。\n',
};
export function git(root, args) {
  const result = spawnSync('/usr/bin/git', ['-C', root, ...args], { encoding: 'utf8', env: {
    ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_TERMINAL_PROMPT: '0',
  } });
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
export function commitWorkspace(f, { paths = ['.agents/core', 'AGENTS.md', '.agents/ksf', '.agents/ksf.ps1'], message = 'Fictional local system checkpoint' } = {}) {
  if (!existsSync(join(f.workspace, '.git'))) {
    git(f.workspace, ['init', '--template=', '--initial-branch=main']);
    git(f.workspace, ['config', 'user.name', 'KSF Fixture']);
    git(f.workspace, ['config', 'user.email', 'fixture@example.invalid']);
    git(f.workspace, ['config', 'commit.gpgsign', 'false']);
  }
  // This helper writes only the isolated test workspace, never a real instance.
  git(f.workspace, ['add', '--force', '--', ...paths]);
  git(f.workspace, ['commit', '-m', message]);
  return git(f.workspace, ['rev-parse', 'HEAD']);
}
export async function distributionFixture(t, { legacyEntry = false, sourceRoot = repository, compact = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'ksf distribution 测试 ')), root = join(directory, 'core');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(root);
  // Reconstruct Core sources without inheriting the source workspace's installed identity.
  const installedMarker = join(sourceRoot, '.agents/core/release.json');
  cpSync(join(sourceRoot, '.agents/core'), join(root, '.agents/core'), { recursive: true,
    filter: path => path !== installedMarker && !path.includes('/runtime/packages') && !path.includes('/runtime/tests') });
  for (const entry of ['ksf', 'ksf.ps1']) cpSync(join(sourceRoot, '.agents', entry), join(root, '.agents', entry));
  cpSync(join(sourceRoot, 'AGENTS.md'), join(root, 'AGENTS.md'));
  const definitionFiles = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? definitionFiles(path) : path.endsWith('.md') ? [path] : [];
  });
  const originals = new Map();
  if (legacyEntry) {
    // Construct an older identity, not a claim to replay a historical release.
    for (const path of [join(root, 'AGENTS.md'), join(root, '.agents/core/runtime/src/objects/schema.js'), ...definitionFiles(join(root, '.agents/core/abilities'))]) {
      const bytes = readFileSync(path, 'utf8'); originals.set(path, bytes);
      writeFileSync(path, bytes.replaceAll('ksf-runtime', 'ksf-assistant').replaceAll('partner.ksf.runtime', 'partner.ksf.assistant').replaceAll('ability-route', 'task-route'));
    }
    renameSync(join(root, '.agents/core/abilities/partners/ksf-runtime'), join(root, '.agents/core/abilities/partners/ksf-assistant'));
    renameSync(join(root, '.agents/core/abilities/competencies/ability-route'), join(root, '.agents/core/abilities/competencies/task-route'));
  }
  writeFileSync(join(root, '.gitignore'), '/.agents/runtime-data/\n/.agents/user-data/\n/知识/\n/.agents/core/release.json\n');
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
  if (!compact) {
    // Existing suites exercise upgrades from the former schema-3 installation.
    // New compact-receipt suites opt in explicitly and use a read-only fake API.
    const { manifest, entries } = inspectCoreArchive(readFileSync(join(first.output, first.index.platforms['darwin-arm64'].core.name)));
    for (const [path, record] of Object.entries(manifest.files)) {
      const bytes = entries.get(path).bytes;
      if (!bytes.includes(0) && Buffer.from(bytes.toString('utf8')).equals(bytes) && path !== '.agents/core/manifest.yaml') record.baseline = bytes.toString('base64');
    }
    writeAtomic(join(workspace, '.agents/core/release.json'), stableJSON(manifest));
  }
  const save = (path, value) => writeAtomic(join(root, path), value, existsSync(join(root, path)) ? fileMode(join(root, path)) : 0o644);
  const next = async (version = '0.1.1', changes = {}) => {
    if (legacyEntry) {
      renameSync(join(root, '.agents/core/abilities/partners/ksf-assistant'), join(root, '.agents/core/abilities/partners/ksf-runtime'));
      renameSync(join(root, '.agents/core/abilities/competencies/task-route'), join(root, '.agents/core/abilities/competencies/ability-route'));
      for (const [path, bytes] of originals) writeFileSync(path, bytes);
      legacyEntry = false;
    }
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
  const launch = (args, options = {}) => spawnSync('/bin/sh', [join(workspace, '.agents/ksf'), ...args], {
    cwd: tmpdir(), encoding: 'utf8', timeout: 20000,
    env: { ...process.env, PATH: '', KSF_SKIP_AUTO_UPDATE: '1', ...options.env },
  });
  return { directory, root, workspace, first, next, save, launch, build };
}
