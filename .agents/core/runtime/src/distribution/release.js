import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { buildManifest } from '../services/build-manifest.js';
import { configuration, fail, sha256, stableJSON, checkedPath, readRegular, walkFiles,
  fileMode, textBytes, validateManifest, versionParts, writeAtomic, parseJSON } from './common.js';
import { createArchive, readArchive } from './archive.js';
import { types } from '../objects/schema.js';
import { products, artifactName, releaseIndexName } from './products.js';

export const userDirectories = ['项目', '知识', ...Object.values(types).map(type => type.user), '@收件箱', '源档', '归档'];
function revisionInfo(root, allowDirty) {
  const git = args => spawnSync('/usr/bin/git', ['-C', root, ...args], { encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  const rev = git(['rev-parse', '--verify', 'HEAD']);
  if (rev.status !== 0 || !/^[a-f0-9]{40}\s*$/.test(rev.stdout)) fail('RELEASE_SOURCE_INVALID', 'Build a release from the Core source repository with an existing commit.');
  const state = git(['status', '--porcelain', '--untracked-files=all', '--', '.agents', 'AGENTS.md', '.gitignore', '.github', 'README.md', ':(exclude).agents/core/manifest.yaml']);
  if (state.status !== 0) fail('RELEASE_SOURCE_INVALID', 'Cannot inspect the Core source state.');
  const dirty = state.stdout.length > 0;
  if (dirty && !allowDirty) fail('RELEASE_SOURCE_DIRTY', 'Commit Core changes before building an official release; --allow-dirty creates a local development package.');
  const time = git(['show', '-s', '--format=%cI', 'HEAD']);
  if (time.status !== 0 || !Number.isFinite(Date.parse(time.stdout.trim()))) fail('RELEASE_SOURCE_INVALID', 'Cannot read the Core commit timestamp.');
  return { revision: rev.stdout.trim(), dirty, builtAt: new Date(time.stdout.trim()).toISOString() };
}
function excluded(path) {
  return path === '.agents/core/release.json' || /(?:^|\/)\.DS_Store$/.test(path) ||
    /^\.agents\/core\/\.manifest\.yaml\..*\.tmp$/.test(path);
}
export function inspectCoreArchive(bytes, { expectedVersion, expectedPlatform, expectedRepository } = {}) {
  const entries = readArchive(bytes), metadata = entries.get('.agents/core/release.json');
  if (!metadata) fail('RELEASE_INVALID', 'Core archive has no release manifest.');
  const manifest = validateManifest(parseJSON(metadata.bytes, 'Core manifest'));
  if ((expectedVersion && manifest.version !== expectedVersion) || (expectedPlatform && manifest.platform !== expectedPlatform) ||
      (expectedRepository && manifest.core.repository !== expectedRepository)) fail('RELEASE_INVALID', 'Core archive identity does not match its release index.');
  if (entries.size !== Object.keys(manifest.files).length + 1) fail('RELEASE_INVALID', 'Archive and managed inventory differ.');
  for (const [path, record] of Object.entries(manifest.files)) {
    const file = entries.get(path);
    if (!file || file.mode !== record.mode || sha256(file.bytes) !== record.sha256) fail('RELEASE_INVALID', `Core file checksum or mode mismatch: ${path}.`);
  }
  return { entries, manifest };
}
export async function buildRelease({ root, output, platform = `${process.platform}-${process.arch}`, allowDirty = false, dryRun = false }) {
  const config = configuration(root), build = parseJSON(readRegular(root, '.agents/core/build.json'), 'build.json');
  versionParts(build.version);
  if (!build.runtime?.packages?.[platform]) fail('PLATFORM_UNSUPPORTED', `No bundled runtime for ${platform}.`);
  const source = revisionInfo(root, allowDirty), paths = [...walkFiles(root, '.agents/core', { exclude: excluded }), '.agents/bin/ksf'].sort();
  const destination = resolve(root, output ?? `.agents/runtime-data/releases/${build.version}-${platform}`);
  const targetRoot = join(destination, products.workspace);
  if (existsSync(destination)) fail('OUTPUT_EXISTS', 'Release output already exists; choose a new output directory.');
  const staging = mkdtempSync(join(tmpdir(), 'ksf-release-'));
  try {
    // Only explicit system files are read. User directories are never scanned.
    const sourceHashes = new Map();
    for (const path of [...paths, 'AGENTS.md']) {
      const bytes = readRegular(root, path), mode = fileMode(checkedPath(root, path));
      sourceHashes.set(path, sha256(bytes));
      writeAtomic(checkedPath(staging, path), bytes, mode);
    }
    await buildManifest(staging, { sourceRoot: root, builtAt: source.builtAt });
    const inventory = {}, coreEntries = [];
    for (const path of [...paths.filter(p => p !== '.agents/core/manifest.yaml'), '.agents/core/manifest.yaml', 'AGENTS.md'].sort()) {
      const bytes = readRegular(staging, path), mode = fileMode(checkedPath(staging, path));
      inventory[path] = { sha256: sha256(bytes), mode, source_path: path,
        ...(textBytes(bytes) && path !== '.agents/core/manifest.yaml' ? { baseline: bytes.toString('base64') } : {}) };
      coreEntries.push({ path, bytes, mode });
    }
    const manifest = validateManifest({ schema_version: 2, name: products.core, product: products.core, version: build.version, platform,
      core: { repository: config.core_repository, branch: config.core_branch, revision: source.revision },
      development: source.dirty, files: inventory });
    coreEntries.push({ path: '.agents/core/release.json', bytes: Buffer.from(stableJSON(manifest)), mode: 0o644 });
    const coreArchive = createArchive(coreEntries);
    inspectCoreArchive(coreArchive, { expectedVersion: build.version, expectedPlatform: platform, expectedRepository: config.core_repository });
    const extras = [];
    for (const file of ['README.md', '.gitignore']) extras.push({ path: file, bytes: readRegular(root, `.agents/core/distribution/template/${file}`), mode: 0o644 });
    extras.push({ path: '.github/workflows/sync-template.yml', mode: 0o644,
      bytes: Buffer.from(readRegular(root, '.agents/core/distribution/template-workflow.yml').toString('utf8').replaceAll('__KSF_TEMPLATE_REPOSITORY__', config.template_repository)) });
    for (const directory of userDirectories) extras.push({ path: `${directory}/.gitkeep`, bytes: Buffer.alloc(0), mode: 0o644 });
    extras.push({ path: '.ksf-template.json', mode: 0o644, bytes: Buffer.from(stableJSON({ schema_version: 1,
      product: products.workspace, instance_default_name: products.instance,
      generated_from: config.core_repository, revision: source.revision, version: build.version })) });
    const fullEntries = [...coreEntries, ...extras], workspaceArchive = createArchive(fullEntries);
    const coreName = artifactName('core', build.version, platform), workspaceName = artifactName('workspace', build.version, platform);
    const base = `https://github.com/${config.core_repository}/releases/download/v${build.version}/`;
    const artifact = (name, bytes) => ({ name, url: base + name, sha256: sha256(bytes), size: bytes.length });
    const index = { schema_version: 1, products, version: build.version, core_repository: config.core_repository,
      core_revision: source.revision, development: source.dirty, platforms: { [platform]: {
        core: artifact(coreName, coreArchive), workspace: artifact(workspaceName, workspaceArchive),
      } } };
    const current = revisionInfo(root, true);
    if (current.revision !== source.revision || [...sourceHashes].some(([p, hash]) => sha256(readRegular(root, p)) !== hash) ||
        paths.join('\n') !== [...walkFiles(root, '.agents/core', { exclude: excluded }), '.agents/bin/ksf'].sort().join('\n')) fail('RELEASE_INPUT_CHANGED', 'Core changed while building the release.');
    const result = { version: build.version, platform, development: source.dirty, coreRevision: source.revision,
      products, output: destination, template: targetRoot, index, managedFiles: Object.keys(inventory).length, dryRun };
    if (!dryRun) {
      mkdirSync(destination, { recursive: true });
      for (const entry of fullEntries) writeAtomic(checkedPath(targetRoot, entry.path), entry.bytes, entry.mode);
      writeAtomic(join(destination, coreName), coreArchive);
      writeAtomic(join(destination, workspaceName), workspaceArchive);
      writeAtomic(join(destination, releaseIndexName), stableJSON(index));
    }
    return result;
  } finally { rmSync(staging, { recursive: true, force: true }); }
}
