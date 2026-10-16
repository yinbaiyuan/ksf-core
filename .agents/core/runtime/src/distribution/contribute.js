import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { checkedPath, digestObject, fail, fileMode, installedManifest, isSHA, managedPath, parseJSON,
  readJSON, readRegular, sha256, stableJSON, textBytes, walkFiles, writeAtomic, writeJSON } from './common.js';
import { GitHubAPI, treeFromChanges } from './github.js';
import { products } from './products.js';

function publicDiff(path, base, bytes, baseMode, mode) {
  if (base !== null && bytes !== null && (!textBytes(base) || !textBytes(bytes))) return `Binary change: ${path}\n`;
  const temporary = mkdtempSync(join(tmpdir(), 'ksf-contribution-diff-'));
  try {
    writeAtomic(join(temporary, 'before'), base ?? Buffer.alloc(0)); writeAtomic(join(temporary, 'after'), bytes ?? Buffer.alloc(0));
    const diff = spawnSync('/usr/bin/diff', ['-u', '-L', base === null ? '/dev/null' : `a/${path}`, '-L', bytes === null ? '/dev/null' : `b/${path}`, join(temporary, 'before'), join(temporary, 'after')], {
      encoding: 'utf8', timeout: 10000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' },
    });
    if (![0, 1].includes(diff.status)) fail('DIFF_FAILED', 'Could not prepare the public diff.');
    return (baseMode !== mode ? `Mode ${baseMode?.toString(8) ?? 'absent'} -> ${mode?.toString(8) ?? 'absent'}: ${path}\n` : '') + diff.stdout;
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}
function eligible(path) { return managedPath(path) && path !== '.agents/core/manifest.yaml' && !/\.tmp$/.test(path); }
export function prepareContribution({ root, paths, all = false, title = `Improve ${products.core}`, body = '', dryRun = false }) {
  const manifest = installedManifest(root);
  if (manifest.development) fail('DEVELOPMENT_PACKAGE', 'Publish a clean Core release before contributing from this development package.');
  if ((!all && (!Array.isArray(paths) || !paths.length)) || (all && paths?.length)) fail('CONTRIBUTION_SELECTION_REQUIRED', 'Choose --paths or --all after reviewing the system changes.');
  if (typeof title !== 'string' || !title.trim() || title.length > 200 || /[\r\n]/.test(title) || typeof body !== 'string' || body.length > 60000) fail('CONTRIBUTION_INVALID', 'Invalid contribution title or description.');
  const selected = all ? [...new Set([...Object.keys(manifest.files), ...walkFiles(root, '.agents/core')])].filter(eligible) : [...new Set(paths)];
  if (selected.some(path => !eligible(path))) fail('CONTRIBUTION_PATH_INVALID', 'Contributions may select only system files; generated manifests, private directories and Git data are excluded.');
  const changes = [], destinations = new Map();
  for (const path of selected.sort()) {
    const original = manifest.files[path], bytes = readRegular(root, path, true), mode = bytes === null ? null : fileMode(checkedPath(root, path));
    const checksum = bytes === null ? null : sha256(bytes);
    if (original ? checksum === original.sha256 && mode === original.mode : bytes === null) continue;
    const sourcePath = original?.source_path ?? path;
    if (!eligible(sourcePath)) fail('CONTRIBUTION_PATH_INVALID', 'The release maps a selected file outside Core source.');
    const sourceMode = mode ?? original?.mode ?? 0o644;
    const change = { workspace_path: path, source_path: sourcePath, workspace_mode: mode,
      operation: bytes === null ? 'delete' : original ? 'update' : 'add',
      before_sha256: original?.sha256 ?? null, after_sha256: checksum,
      mode: sourceMode, content: bytes === null ? null : bytes.toString('base64'),
      diff: original && original.baseline === undefined ? `Binary change: ${sourcePath}\n` : publicDiff(sourcePath, original ? Buffer.from(original.baseline, 'base64') : null, bytes, original?.mode ?? null, bytes === null ? null : sourceMode) };
    if (destinations.has(sourcePath)) {
      const previous = destinations.get(sourcePath);
      if (previous.after_sha256 !== change.after_sha256 || previous.mode !== change.mode) fail('CONTRIBUTION_MAPPING_CONFLICT', `Two workspace files propose different content for ${sourcePath}.`);
      continue;
    }
    destinations.set(sourcePath, change); changes.push(change);
  }
  if (!changes.length) fail('CONTRIBUTION_EMPTY', 'The selected system files have no changes.');
  const plan = { schema_version: 1, id: randomUUID(), created_at: new Date().toISOString(),
    core: manifest.core, version: manifest.version, title: title.trim(), body, changes };
  const digest = digestObject(plan), directory = `.agents/runtime-data/contributions/${plan.id}`;
  if (!dryRun) {
    writeJSON(checkedPath(root, `${directory}/plan.json`), { ...plan, digest });
    writeAtomic(checkedPath(root, `${directory}/review.diff`), changes.map(c => c.diff).join('\n'));
  }
  return { ...plan, digest, dryRun, reviewPath: dryRun ? null : `${directory}/review.diff` };
}
export function readContribution({ root, id }) {
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) fail('CONTRIBUTION_INVALID', 'Invalid contribution ID.');
  const stored = readJSON(root, `.agents/runtime-data/contributions/${id}/plan.json`), { digest, ...plan } = stored;
  if (!isSHA(digest) || digestObject(plan) !== digest || plan.schema_version !== 1 || plan.id !== id || !Array.isArray(plan.changes) || !plan.changes.length) fail('CONTRIBUTION_TAMPERED', 'The prepared contribution changed; prepare and review it again.');
  for (const change of plan.changes) {
    if (!eligible(change.workspace_path) || !eligible(change.source_path) || ![0o644, 0o755].includes(change.mode) ||
        (change.content !== null && (typeof change.content !== 'string' || sha256(Buffer.from(change.content, 'base64')) !== change.after_sha256))) fail('CONTRIBUTION_INVALID', 'Invalid prepared system change.');
  }
  return { ...plan, digest };
}
export async function submitContribution({ root, id, reviewed, dryRun = false, api }) {
  const plan = readContribution({ root, id }), manifest = installedManifest(root);
  const targetBranch = plan.core.branch;
  if (reviewed !== plan.digest) fail('CONTRIBUTION_REVIEW_REQUIRED', 'Supply the digest of the contribution preview using --reviewed.');
  if (manifest.development || manifest.core.revision !== plan.core.revision || manifest.core.repository !== plan.core.repository || manifest.core.branch !== targetBranch) fail('CONTRIBUTION_STALE', 'The installed Core changed after preparing this contribution.');
  for (const change of plan.changes) {
    const bytes = readRegular(root, change.workspace_path, true), original = manifest.files[change.workspace_path];
    if ((bytes === null ? null : sha256(bytes)) !== change.after_sha256 ||
        (bytes !== null && fileMode(checkedPath(root, change.workspace_path)) !== change.workspace_mode) ||
        (original?.sha256 ?? null) !== change.before_sha256 || (original?.source_path ?? change.workspace_path) !== change.source_path) fail('CONTRIBUTION_STALE', 'Selected system files changed after the preview; prepare and review again.');
  }
  if (dryRun) return { id, digest: plan.digest, dryRun, repository: plan.core.repository, base: targetBranch,
    files: plan.changes.map(c => ({ path: c.source_path, operation: c.operation })), wouldPublish: true };
  const github = api ?? new GitHubAPI(), statePath = `.agents/runtime-data/contributions/${id}/submitted.json`;
  const previous = readJSON(root, statePath, true);
  if (previous?.digest && previous.digest !== plan.digest) fail('CONTRIBUTION_TAMPERED', 'Published contribution state does not match the reviewed plan.');
  if (previous?.branch && previous.branch !== `contrib-${id}`) fail('CONTRIBUTION_TAMPERED', 'Published contribution branch does not match this plan.');
  if (previous?.url) return { ...previous, reused: true };
  const profile = await github.request('GET', '/user'), owner = plan.core.repository.split('/')[0];
  if (typeof profile.login !== 'string' || !/^[A-Za-z0-9-]+$/.test(profile.login)) fail('GITHUB_RESPONSE_INVALID', 'Invalid authenticated GitHub login.');
  let repository = plan.core.repository;
  if (profile.login.toLowerCase() !== owner.toLowerCase()) {
    repository = `${profile.login}/${plan.core.repository.split('/')[1]}`;
    let fork = await github.request('GET', `/repos/${repository}`, undefined, { optional: true });
    if (!fork) {
      await github.request('POST', `/repos/${plan.core.repository}/forks`, {});
      for (let attempt = 0; attempt < 6 && !fork; attempt++) {
        if (attempt) await new Promise(resolve => setTimeout(resolve, 1000));
        fork = await github.request('GET', `/repos/${repository}`, undefined, { optional: true });
      }
    }
    if (!fork || fork.parent?.full_name?.toLowerCase() !== plan.core.repository.toLowerCase()) fail('FORK_INVALID', 'The account repository is not a fork of the configured Core; no files were pushed.');
  }
  const branch = previous?.branch ?? `contrib-${id}`, base = await github.request('GET', `/repos/${plan.core.repository}/git/commits/${plan.core.revision}`);
  const tree = await treeFromChanges(github, repository, plan.changes, base.tree.sha);
  let ref = await github.request('GET', `/repos/${repository}/git/ref/heads/${branch}`, undefined, { optional: true });
  if (ref) {
    const existing = await github.request('GET', `/repos/${repository}/git/commits/${ref.object.sha}`);
    if (existing.tree.sha !== tree.sha || existing.parents?.[0]?.sha !== plan.core.revision) fail('CONTRIBUTION_BRANCH_CHANGED', 'The contribution branch was changed remotely; it will not be overwritten.');
  } else {
    const commit = await github.request('POST', `/repos/${repository}/git/commits`, { message: plan.title,
      tree: tree.sha, parents: [plan.core.revision] });
    ref = await github.request('POST', `/repos/${repository}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha });
  }
  const state = { id, digest: plan.digest, repository, branch, commit: ref.object.sha, target: plan.core.repository };
  writeJSON(checkedPath(root, statePath), state);
  const head = `${profile.login}:${branch}`;
  const existing = await github.request('GET', `/repos/${plan.core.repository}/pulls?state=all&head=${encodeURIComponent(head)}&base=${encodeURIComponent(targetBranch)}&per_page=100`);
  let pr = Array.isArray(existing) ? existing.find(p => p.head?.ref === branch && p.base?.ref === targetBranch) : null;
  if (!pr) pr = await github.request('POST', `/repos/${plan.core.repository}/pulls`, { title: plan.title, head, base: targetBranch,
    body: plan.body + `\n\nPrepared from ${products.core} ${plan.version} (${plan.core.revision}).\nOnly the reviewed system-file changes are included.`, draft: true });
  if (typeof pr.html_url !== 'string' || !pr.number) fail('GITHUB_RESPONSE_INVALID', 'GitHub did not return a pull request URL.');
  const final = { ...state, number: pr.number, url: pr.html_url, draft: pr.draft === true };
  writeJSON(checkedPath(root, statePath), final);
  return final;
}
