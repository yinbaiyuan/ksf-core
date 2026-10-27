export interface GitEntry { path: string; originalPath: string | null; index: string; worktree: string; conflict: boolean; untracked: boolean }
export interface GitStatus { version: string; branch: { name: string | null; oid: string | null; upstream: string | null; ahead: number; behind: number }; entries: GitEntry[]; merging: boolean; remotes: string[]; latestCommit: string[] | null; changedCount: number; conflictCount: number; lastFetchedAt: string | null }
export interface Repository extends Partial<GitStatus> { id: string; name: string; path: string; kind: string; worktree: boolean; error: string | null; statusState?: 'pending' | 'ready' | 'stale' | 'error'; statusUpdatedAt?: string | null }
export function repositoryStatusText(repo: Repository, compact = false) {
  if (repo.error) return compact ? '不可用' : '状态不可用';
  if (repo.changedCount === undefined) return compact ? '待更新' : '正在读取状态…';
  const unit = compact ? ' ' : ' 个';
  const text = repo.conflictCount ? `${compact ? '' : '⚠ '}${repo.conflictCount}${unit}冲突` : repo.changedCount ? `${repo.changedCount}${unit}变更` : '干净';
  return text + (!compact && repo.statusState === 'stale' ? ' · 更新中' : '');
}
export function repositoryMatches(repo: Repository, filter: string, dirtyOnly: boolean) {
  return `${repo.name} ${repo.path}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase()) && (!dirtyOnly || repo.changedCount === undefined || !!repo.changedCount || !!repo.error);
}
export interface Commit { oid: string; parents: string[]; author: string; at: string; subject: string; refs: string }
export interface GitDiff { path: string; workspacePath: string; version: string; snapshotId: string; staged: boolean; historical: boolean; patch: string; before: string; after: string; binary: boolean; hunks: { id: string; header: string; text: string }[] }
export interface Operation { id: string; repo: string; action: string; status: 'queued' | 'running' | 'completed' | 'failed'; progress: string; result?: { output: string; state: Omit<GitStatus, 'entries'> }; error?: { code: string; message: string; uncertain?: boolean } }
export function graphRows(commits: Commit[]) {
  let lanes: string[] = [];
  const loaded = new Set(commits.map(commit => commit.oid));
  return commits.map(commit => {
    let lane = lanes.indexOf(commit.oid); if (lane < 0) { lane = lanes.length; lanes.push(commit.oid); }
    const before = [...lanes]; lanes.splice(lane, 1);
    for (const [i, parent] of commit.parents.entries()) if (loaded.has(parent) && !lanes.includes(parent)) lanes.splice(Math.min(lane + i, lanes.length), 0, parent);
    const edges = before.flatMap((oid, from) => oid === commit.oid ? commit.parents.map(parent => ({ from, to: lanes.indexOf(parent), color: from })) : [{ from, to: lanes.indexOf(oid), color: from }]);
    return { oid: commit.oid, lane, edges: edges.filter(e => e.to >= 0), width: Math.max(before.length, lanes.length, 1) };
  });
}
export function conflictBlocks(text: string) {
  const pattern = /^<<<<<<<[^\n]*\r?\n([\s\S]*?)(?:^\|\|\|\|\|\|\|[^\n]*\r?\n[\s\S]*?)?^=======\r?\n([\s\S]*?)^>>>>>>>[^\n]*(?:\r?\n|$)/gm;
  return [...text.matchAll(pattern)].map(m => ({ from: m.index!, to: m.index! + m[0].length, ours: m[1], theirs: m[2] }));
}

export interface GitRef { name: string; fullName: string; oid: string; upstream: string; current: boolean; kind: 'local' | 'remote' | 'tag'; subject: string; at: string }
export interface Stash { ref: string; oid: string; subject: string; at: string }
export interface GitRefs { branches: GitRef[]; stashes: Stash[] }
export interface CommitDetail { oid: string; author: string; email: string; at: string; committedAt: string; parents: string[]; message: string; paths: string[]; files: { path: string; status: string; added: number | null; removed: number | null }[] }
export type Selection = { path: string; staged: boolean; rev?: string };
export type GitAction = (action: string, input?: Record<string, unknown>) => Promise<boolean>;
export const actionLabels: Record<string, string> = { 'config-set':'保存提交身份', 'config-unset':'恢复身份继承', 'remote-add':'新增远端', 'remote-rename':'重命名远端', 'remote-set-url':'修改远端地址', 'remote-url-add':'添加远端地址', 'remote-url-remove':'移除远端地址', 'remote-remove':'删除远端', stage: '暂存文件', unstage: '取消暂存', hunk: '更新差异块', commit: '提交', 'branch-create': '新建分支', 'branch-track': '检出远程分支', 'branch-rename': '重命名分支', 'branch-switch': '切换分支', 'branch-delete': '删除分支', merge: '合并分支', 'merge-abort': '中止合并', 'merge-complete': '完成合并', fetch: '获取远程更新', pull: '拉取', push: '推送', 'stash-create': '创建贮藏', 'stash-apply': '应用贮藏', 'stash-pop': '弹出贮藏', 'stash-drop': '删除贮藏', resolve: '解决冲突' };
export function entryLabel(entry: GitEntry, staged: boolean) {
  if (entry.conflict) return '冲突'; if (entry.untracked) return '未跟踪';
  return ({ M: '已修改', A: '新增', D: '已删除', R: '重命名', C: '复制', T: '类型变化', U: '冲突' } as Record<string, string>)[staged ? entry.index : entry.worktree] ?? '变更';
}
export function filterEntries(entries: GitEntry[], filter: string, kind = 'all') {
  const needle = filter.trim().toLocaleLowerCase();
  return entries.filter(e => (!needle || `${e.path} ${e.originalPath ?? ''}`.toLocaleLowerCase().includes(needle)) && (kind === 'all' || kind === 'conflict' && e.conflict || kind === 'untracked' && e.untracked || kind === 'tracked' && !e.untracked && !e.conflict))
    .sort((a, b) => Number(b.conflict) - Number(a.conflict) || a.path.localeCompare(b.path, 'zh-CN', { numeric: true }));
}
export function remoteTarget(branch: GitStatus['branch'], remotes: string[]) {
  const remote = [...remotes].sort((a, b) => b.length - a.length).find(r => branch.upstream?.startsWith(r + '/')) ?? remotes[0] ?? '';
  return { remote, branch: branch.upstream?.startsWith(remote + '/') ? branch.upstream.slice(remote.length + 1) : branch.name ?? '' };
}
export function patchLines(patch: string) {
  let before = 0, after = 0;
  return patch.split('\n').map(text => {
    const header = text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (header) { before = +header[1]; after = +header[2]; return { text, before: '', after: '', kind: 'header' }; }
    if (!before && !after || /^(?:diff |index |--- |\+\+\+ |\\)/.test(text)) return { text, before: '', after: '', kind: 'meta' };
    if (text.startsWith('+')) return { text, before: '', after: String(after++), kind: 'add' };
    if (text.startsWith('-')) return { text, before: String(before++), after: '', kind: 'remove' };
    if (text.startsWith(' ')) return { text, before: String(before++), after: String(after++), kind: 'context' };
    return { text, before: '', after: '', kind: 'meta' };
  });
}

// This is a UI invalidation key, not a security or repository-state digest.
export function historyKey(head: string | null | undefined, refs: GitRefs | null) {
  const text = [head ?? '', ...(refs?.branches.map(b => `${b.fullName}:${b.oid}`).sort() ?? [])].join('|');
  let key = 2166136261; for (let i = 0; i < text.length; i++) key = Math.imul(key ^ text.charCodeAt(i), 16777619);
  return (key >>> 0).toString(36);
}

export function gitErrorSummary(error?: Operation['error']) {
  const message = error?.message ?? '操作未完成，请检查结果。';
  if (/could not lock config file|GIT_CONFIG_LOCKED/i.test(message) || error?.code==='GIT_CONFIG_LOCKED') return 'Git 配置正在被占用。输入已保留，请等待其他操作结束后重试。';
  if (/index\.lock.*File exists|Another git process seems to be running/i.test(message)) return 'Git 索引正在被占用。请等待其他 Git 操作结束，再刷新重试。';
  if (/Author identity unknown|unable to auto-detect email address/i.test(message)) return '尚未配置 Git 提交身份。请在仓库设置中配置姓名与邮箱后重试。';
  if (/Authentication failed|could not read Username|Permission denied \(publickey\)/i.test(message)) return '远程认证失败。请检查本机凭据助手或 SSH 配置，详细信息见操作输出。';
  if (/not possible to fast-forward|divergent branches/i.test(message)) return '分支已分叉，无法快进拉取。请先获取更新，检查后再合并分支。';
  if (/non-fast-forward|fetch first/i.test(message)) return '远程有尚未包含的提交。请先获取并检查差异，再合并或拉取。';
  return message.length > 240 ? message.split('\n')[0].slice(0, 200) + '（详细信息见操作输出）' : message;
}

export function validBranchName(value: string) {
  return !!value && value.length <= 1024 && value !== 'HEAD' && !value.startsWith('-') && !value.endsWith('.') && !value.includes('..') && !value.includes('@{') && !/[\x00-\x20\x7f~^:?*\[\\]/.test(value) && !value.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.lock'));
}
