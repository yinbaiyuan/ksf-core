import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fail } from './errors.js';
import { isRevision, isRepository, isBranch } from './git-values.js';

// Large base64 JSON bodies can be rejected by the Git Database REST API.
// Git's pack protocol also reuses unchanged blobs already held by the target.
export const gitTemplateThreshold = 8 * 1024 * 1024;
const executable = process.platform === 'win32' ? 'git' : '/usr/bin/git';

export function verifyTemplateGit() {
  if (spawnSync(executable, ['--version'], { timeout: 5000, stdio: 'ignore' }).status !== 0)
    fail('TEMPLATE_GIT_REQUIRED', 'Publishing a template containing large files requires Git.');
}

export async function publishGitTemplate({ repository, branch, expectedHead, expectedTree, entries, message, token, remoteURL, run = spawnSync }) {
  if (!isRepository(repository) || !isBranch(branch) || !isRevision(expectedHead) || !isRevision(expectedTree))
    fail('TEMPLATE_GIT_INVALID', 'Invalid frozen template destination.');
  verifyTemplateGit();
  const directory = mkdtempSync(join(tmpdir(), 'ksf-template-git-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  Object.assign(env, { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'KSF Template Publisher', GIT_AUTHOR_EMAIL: 'noreply@ksf.invalid',
    GIT_COMMITTER_NAME: 'KSF Template Publisher', GIT_COMMITTER_EMAIL: 'noreply@ksf.invalid',
    KSF_TEMPLATE_EXPECTED_REF: `refs/heads/${branch}`, KSF_TEMPLATE_EXPECTED_HEAD: expectedHead,
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'credential.helper', GIT_CONFIG_VALUE_0: '' });
  if (token) Object.assign(env, { GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_1: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_1: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}` });
  const remote = remoteURL ?? `https://github.com/${repository}.git`;
  const execute = (args, input, stage) => {
    const result = run(executable, ['-C', directory, ...args], { env, input, timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
    if (result.status !== 0) fail('TEMPLATE_GIT_FAILED', `Template Git ${stage} failed; inspect the remote state before retrying.`, { stage });
    return result.stdout.toString().trim();
  };
  try {
    execute(['init', '--template=', '--initial-branch=publication'], undefined, 'initialization');
    execute(['fetch', '--no-tags', '--depth=1', remote, `refs/heads/${branch}`], undefined, 'fetch');
    if (execute(['rev-parse', 'FETCH_HEAD'], undefined, 'source check') !== expectedHead)
      fail('TEMPLATE_CHANGED', 'The template branch changed before the Git transfer; it was not overwritten.');
    const records = [];
    for (const entry of entries.values()) {
      const blob = execute(['hash-object', '-w', '--stdin'], entry.bytes, 'blob preparation');
      if (!isRevision(blob)) fail('TEMPLATE_GIT_FAILED', 'Git did not return a valid template blob.');
      records.push(`${entry.mode === 0o755 ? '100755' : '100644'} ${blob}\t${entry.path}\0`);
    }
    execute(['read-tree', '--empty'], undefined, 'index initialization');
    execute(['update-index', '-z', '--index-info'], Buffer.from(records.join('')), 'tree preparation');
    const tree = execute(['write-tree'], undefined, 'tree verification');
    if (tree === expectedTree) return { tree, commit: expectedHead, changed: false };
    const commit = execute(['commit-tree', tree, '-p', expectedHead], Buffer.from(message + '\n'), 'commit preparation');
    if (!isRevision(tree) || !isRevision(commit)) fail('TEMPLATE_GIT_FAILED', 'Git returned invalid template objects.');
    // A normal push must fast-forward the observed parent; never force or merge.
    // Reconcile even a failed/unknown push response using the computed commit.
    // Inspect the server-advertised old OID as well. A plain fast-forward check
    // alone would accept a concurrent rewind or recreate a deleted branch.
    // After this hook, Git's receive-pack atomically compares that same OID.
    mkdirSync(join(directory, '.git/hooks'), { recursive: true });
    writeFileSync(join(directory, '.git/hooks/pre-push'), '#!/bin/sh\n' +
      'read -r local_ref local_oid remote_ref remote_oid || exit 1\n' +
      '[ "$remote_ref" = "$KSF_TEMPLATE_EXPECTED_REF" ] && [ "$remote_oid" = "$KSF_TEMPLATE_EXPECTED_HEAD" ]\n', { mode: 0o755 });
    const pushed = run(executable, ['-C', directory, 'push', '--porcelain', remote, `${commit}:refs/heads/${branch}`],
      { env, timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
    return { tree, commit, changed: true, pushFailed: pushed.status !== 0 };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
