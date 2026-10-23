import { spawnSync } from 'node:child_process';
import { fail } from './errors.js';

export function githubToken() {
  const environment = process.env.KSF_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (environment) return environment;
  const result = spawnSync('gh', ['auth', 'token', '--hostname', 'github.com'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  fail('GITHUB_AUTH_REQUIRED', 'GitHub authorization is required only for publishing: sign in with gh auth login, or supply KSF_GITHUB_TOKEN/GH_TOKEN.');
}
function readOnlyToken() {
  try { return githubToken(); }
  catch (error) { if (error.code !== 'GITHUB_AUTH_REQUIRED') throw error; return undefined; }
}
export class GitHubAPI {
  constructor({ token, readOnly = false, fetcher = fetch, apiBase = 'https://api.github.com', uploadBase = 'https://uploads.github.com' } = {}) {
    this.readOnly = readOnly;
    this.token = token ?? (readOnly ? readOnlyToken() : githubToken());
    this.fetcher = fetcher; this.apiBase = apiBase; this.uploadBase = uploadBase;
  }
  async request(method, path, body, { optional = false, binary = false, upload = false } = {}) {
    if (this.readOnly && method !== 'GET') fail('GITHUB_REQUEST_INVALID', 'This client permits baseline reads only.');
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) fail('GITHUB_REQUEST_INVALID', 'GitHub API paths must be relative to the configured API.');
    let response;
    try {
      response = await this.fetcher((upload ? this.uploadBase : this.apiBase) + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(binary ? 120000 : 30000),
        headers: { Accept: 'application/vnd.github+json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'KSF-Core',
          ...(body === undefined ? {} : { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' }) },
        ...(body === undefined ? {} : { body: binary ? body : JSON.stringify(body) }),
      });
    } catch { fail('GITHUB_REQUEST_FAILED', 'GitHub request did not complete; retry the same operation to recover its existing branch or PR.'); }
    if (optional && response.status === 404) return null;
    if (!response.ok) fail(response.status === 401 ? 'GITHUB_AUTH_REQUIRED' : response.status === 403 ? 'GITHUB_PERMISSION_DENIED' : 'GITHUB_REQUEST_FAILED', `GitHub returned HTTP ${response.status} for ${method} ${path.split('?')[0]}.`);
    if (response.status === 204) return null;
    try { return await response.json(); }
    catch { fail('GITHUB_RESPONSE_INVALID', 'GitHub returned an invalid JSON response.'); }
  }
}
export async function treeFromChanges(api, repository, changes, baseTree) {
  const tree = [];
  for (const change of changes) {
    const entry = { path: change.source_path ?? change.path, mode: change.mode === 0o755 ? '100755' : '100644', type: 'blob' };
    if (change.content === null) entry.sha = null;
    else {
      const bytes = Buffer.from(change.content, 'base64');
      if (!bytes.includes(0) && Buffer.from(bytes.toString('utf8')).equals(bytes)) entry.content = bytes.toString('utf8');
      else entry.sha = (await api.request('POST', `/repos/${repository}/git/blobs`, { content: change.content, encoding: 'base64' })).sha;
    }
    tree.push(entry);
  }
  return await api.request('POST', `/repos/${repository}/git/trees`, { ...(baseTree ? { base_tree: baseTree } : {}), tree });
}
