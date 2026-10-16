import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const blobID = bytes => createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
export class ForkAPI {
  constructor({ coreRoot, login = 'contributor', wrongFork = false, failAfterPR = false, failAfterRef = false } = {}) {
    this.coreRoot = coreRoot; this.failAfterRef = failAfterRef; this.blobs = new Map(); this.trees = new Map();
    this.login = login; this.wrongFork = wrongFork; this.failAfterPR = failAfterPR;
    this.calls = []; this.fork = false; this.ref = null; this.pr = null; this.prCount = 0;
    this.commit = { sha: 'c'.repeat(40), tree: { sha: 'b'.repeat(40) }, parents: [] };
  }
  git(args) {
    const result = spawnSync('/usr/bin/git', ['-C', this.coreRoot, ...args], { maxBuffer: 256 * 1024 * 1024 });
    if (result.status !== 0) throw new Error('Cannot read the isolated Core fixture Git objects.');
    return result.stdout;
  }
  tree(sha) {
    if (this.trees.has(sha)) return this.trees.get(sha);
    return this.git(['ls-tree', '-r', '-t', '-z', sha]).toString().split('\0').filter(Boolean).map(row => {
      const [metadata, path] = row.split('\t'), [mode, type, sha] = metadata.split(' ');
      return { path, mode, type, sha };
    });
  }
  async request(method, path, body) {
    this.calls.push({ method, path, body });
    if (path === '/user') return { login: this.login };
    if (method === 'GET' && path === '/repos/contributor/ksf-core') return this.fork ? { parent: { full_name: this.wrongFork ? 'wrong/core' : 'yinbaiyuan/ksf-core' } } : null;
    if (method === 'POST' && path.endsWith('/forks')) { this.fork = true; return {}; }
    if (method === 'GET' && path.includes('/git/commits/')) {
      if (path.endsWith('/' + this.commit.sha)) return this.commit;
      const sha = path.split('/').at(-1), tree = this.git(['show', '-s', '--format=%T', sha]).toString().trim();
      return { sha, tree: { sha: tree } };
    }
    if (method === 'GET' && path.includes('/git/trees/')) {
      const sha = path.split('/').at(-1).split('?')[0];
      return { sha, truncated: false, tree: this.tree(sha) };
    }
    if (method === 'GET' && path.includes('/git/blobs/')) {
      const sha = path.split('/').at(-1), bytes = this.blobs.get(sha) ?? this.git(['cat-file', 'blob', sha]);
      return { sha, encoding: 'base64', content: bytes.toString('base64'), size: bytes.length };
    }
    if (method === 'POST' && path.endsWith('/git/blobs')) {
      const bytes = Buffer.from(body.content, 'base64'), sha = blobID(bytes); this.blobs.set(sha, bytes); return { sha };
    }
    if (method === 'POST' && path.endsWith('/git/trees')) {
      const entries = new Map(this.tree(body.base_tree).map(entry => [entry.path, entry]));
      for (const entry of body.tree) {
        if (entry.sha === null) entries.delete(entry.path);
        else {
          const bytes = entry.content === undefined ? this.blobs.get(entry.sha) : Buffer.from(entry.content);
          const sha = entry.sha ?? blobID(bytes); if (bytes) this.blobs.set(sha, bytes);
          entries.set(entry.path, { path: entry.path, mode: entry.mode, type: 'blob', sha });
        }
      }
      this.trees.set('b'.repeat(40), [...entries.values()]); return { sha: 'b'.repeat(40) };
    }
    if (method === 'GET' && path.includes('/git/ref/heads/')) return this.ref;
    if (method === 'POST' && path.endsWith('/git/commits')) { this.commit.parents = body.parents.map(sha => ({ sha })); return this.commit; }
    if (method === 'POST' && path.endsWith('/git/refs')) {
      this.ref = { object: { sha: body.sha } };
      if (this.failAfterRef) { this.failAfterRef = false; throw Object.assign(new Error('unknown ref response'), { code: 'GITHUB_REQUEST_FAILED' }); }
      return this.ref;
    }
    if (method === 'GET' && path.includes('/pulls?')) return this.pr ? [this.pr] : [];
    if (method === 'GET' && path.endsWith('/pulls/17')) return this.pr;
    if (method === 'POST' && path.endsWith('/pulls')) {
      this.prCount++;
      this.pr = { number: 17, html_url: 'https://github.com/yinbaiyuan/ksf-core/pull/17', draft: true,
        state: 'open', merged: false, head: { ref: body.head.split(':')[1], sha: this.ref.object.sha,
          repo: { full_name: `${this.login}/ksf-core` } }, base: { ref: body.base, repo: { full_name: 'yinbaiyuan/ksf-core' } } };
      if (this.failAfterPR) { this.failAfterPR = false; throw Object.assign(new Error('unknown response'), { code: 'GITHUB_REQUEST_FAILED' }); }
      return this.pr;
    }
    throw new Error(`Unexpected fixture API call: ${method} ${path}`);
  }
}
