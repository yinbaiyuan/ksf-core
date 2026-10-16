import { realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fail, managedPath, parseJSON, sha256, validRelative, validateContributionManifest } from './common.js';

const gitBinary = process.platform === 'win32' ? 'git' : '/usr/bin/git';
const gitEnvironment = () => {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1' };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_SHALLOW_FILE', 'GIT_NAMESPACE']) delete env[name];
  return env;
};
export const isLocalCommit = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
export const contributionPath = path => (managedPath(path) || path === '.agents/bin/ksf') &&
  path !== '.agents/core/manifest.yaml' && !/\.tmp$/.test(path);

// Git plumbing reads immutable objects, never the index, filters or working files.
export function committedSource(root, { commit, binary = gitBinary } = {}) {
  const run = args => {
    const result = spawnSync(binary, ['--no-replace-objects', '--literal-pathspecs', '-C', root, ...args], {
      env: gitEnvironment(), timeout: 30000, maxBuffer: 256 * 1024 * 1024,
    });
    if (result.error?.code === 'ENOENT') fail('CONTRIBUTION_GIT_REQUIRED', 'Git is required to contribute already committed system changes.');
    if (result.error) fail('CONTRIBUTION_GIT_FAILED', 'Could not read the local Git objects.');
    return result;
  };
  const top = run(['rev-parse', '--show-toplevel']);
  if (top.status !== 0) fail('CONTRIBUTION_GIT_REQUIRED', 'Use a Git repository at the KSF root and commit the intended system changes first.');
  if (realpathSync(top.stdout.toString('utf8').replace(/\r?\n$/, '')) !== realpathSync(root)) {
    fail('CONTRIBUTION_GIT_ROOT_MISMATCH', 'The KSF root must be the Git working-tree root.');
  }
  const head = run(['rev-parse', '--verify', 'HEAD^{commit}']);
  const headCommit = head.stdout.toString('utf8').trim();
  if (head.status !== 0 || !isLocalCommit(headCommit)) fail('CONTRIBUTION_HEAD_REQUIRED', 'The KSF repository has no readable HEAD commit.');
  if (commit !== undefined && !isLocalCommit(commit)) fail('CONTRIBUTION_INVALID', 'Invalid local contribution commit.');
  const sourceCommit = commit ?? headCommit;
  const listing = run(['ls-tree', '-r', '-z', sourceCommit, '--', 'AGENTS.md', '.agents/core', '.agents/bin/ksf', '.agents/ksf', '.agents/ksf.ps1']);
  if (listing.status !== 0) fail('CONTRIBUTION_SOURCE_MISSING', 'The recorded local contribution commit is unavailable.');
  const entries = new Map();
  for (const row of listing.stdout.toString('utf8').split('\0').filter(Boolean)) {
    const tab = row.indexOf('\t'), [mode, type, object] = row.slice(0, tab).split(' '), path = row.slice(tab + 1);
    if (tab < 0 || !validRelative(path) || !isLocalCommit(object) || entries.has(path)) {
      fail('CONTRIBUTION_FILE_TYPE', 'The committed system tree contains an unsupported path or object.');
    }
    entries.set(path, { mode, type, object });
  }
  const read = path => {
    const entry = entries.get(path);
    if (!entry) return null;
    if (entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) {
      fail('CONTRIBUTION_FILE_TYPE', `Only regular committed system files may be contributed: ${path}.`);
    }
    const result = run(['cat-file', 'blob', entry.object]);
    if (result.status !== 0) fail('CONTRIBUTION_SOURCE_MISSING', 'Could not read a recorded system blob.');
    return { bytes: result.stdout, mode: entry.mode === '100755' ? 0o755 : 0o644 };
  };
  return { sourceCommit, headCommit, entries, read };
}

export function contributionBaseline(source) {
  const file = source.read('.agents/core/release.json');
  if (!file) fail('CONTRIBUTION_BASELINE_MISSING', 'HEAD has no release manifest; commit a verified installed release baseline before contributing.');
  let manifest;
  try { manifest = validateContributionManifest(parseJSON(file.bytes, 'committed Core release manifest')); }
  catch { fail('CONTRIBUTION_BASELINE_INVALID', 'The release baseline stored in the local commit is invalid.'); }
  if (manifest.development) fail('DEVELOPMENT_PACKAGE', 'HEAD contains a development-package baseline; a verified original Core baseline is required.');
  return { manifest, baseline: { schema_version: manifest.schema_version, manifest_sha256: sha256(file.bytes) } };
}
