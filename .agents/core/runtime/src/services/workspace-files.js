import{platform}from'../platform/index.js';
import { promises as fs, constants, realpathSync } from 'node:fs';
import { join, resolve, relative, dirname, basename, sep, isAbsolute, posix } from 'node:path';
import { randomUUID } from 'node:crypto';
import { digest, assert, problem } from './workbench-common.js';

const SKIP = new Set(['.git', 'node_modules', '.DS_Store', '.cache', '.next', '.venv', '__pycache__', 'dist', 'target', 'build']);
const PRIVATE = /^(?:\.env(?:\..*)?|\.git-credentials|\.?netrc|_netrc|\.npmrc|\.pypirc|\.ssh|\.aws|\.gnupg|\.azure|\.kube|\.docker|\.?credentials(?:\..*)?|auth\.json|id_(?:rsa|ed25519|ecdsa)(?:\.pub)?|identity\.key|.*\.(?:pem|p12|pfx|key))$/i;
export function filePolicy(path) {
  const parts = path.split('/');
  if (parts.some(p => p.toLowerCase() === '.git' || PRIVATE.test(p)) || /^\.agents\/runtime-data(?:\/|$)/i.test(path)) return 'blocked';
  if (/^档案\/对话\/(?:Codex|[^/]+\/turns)(?:\/|$)/i.test(path)) return 'readonly';
  if (parts.some(p => SKIP.has(p))) return 'readonly';
  if (/^\.agents(?:\/|$)/i.test(path) || ['agents.md', 'readme.md', '.gitignore'].includes(path.toLowerCase()) || path.toLowerCase().startsWith('.github/')) return 'system';
  return 'editable';
}

// Root navigation only: keep this ordered list as the single place to add entries.
const ROOT_ENTRIES = ['.agents', '@收件箱', '档案', '能力', '项目', '知识', 'repositories', 'AGENTS.md', 'BOT.md', 'README.md', 'USER.md'];
const ROOT_ORDER = new Map(ROOT_ENTRIES.map((name, index) => [name, index]));
const TEXT_LIMIT = 8 * 1024 * 1024;
const inside = (root, path) => { const rel = relative(root, path); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep); };
export function createWorkspaceFiles(root, coordinator) {
  root = realpathSync(root);
  const unlocked = new Set();
  const display = path => relative(root, path).split(sep).join('/');
  async function locate(path = '', { missing = false, content = true, missingParents = false } = {}) {
    assert(typeof path === 'string' && path.length <= 4096 && !/[\x00-\x1f\x7f\\]/.test(path) && !isAbsolute(path), 'WORKSPACE_PATH_INVALID', '请使用 KSF 内的相对路径。');
    const pieces = path.split('/').filter(Boolean);
    assert(pieces.every(p => p !== '..' && p !== '.' && !/^[A-Za-z]:/.test(p) && platform.validSegment(p)), 'WORKSPACE_PATH_INVALID', '路径不能越出 KSF 或访问文件数据流。');
    const normalized = pieces.join('/'), target = resolve(root, ...pieces);
    assert(inside(root, target), 'WORKSPACE_PATH_INVALID', '路径不能越出 KSF。');
    if (content) assert(filePolicy(normalized) !== 'blocked', 'WORKSPACE_PROTECTED', '此文件由系统或凭据管理器持有，不开放内容访问。', 403);
    let current = root;
    const parents = [root, ...pieces.map(p => current = join(current, p))];
    for (let i = 0; i < parents.length; i++) {
      let entry;
      try { entry = await fs.lstat(parents[i]); }
      catch (error) { if (missing && error.code === 'ENOENT' && (i === parents.length - 1 || missingParents)) return { target, path: normalized, stat: null }; throw error; }
      assert(!entry.isSymbolicLink(), 'WORKSPACE_SYMLINK', '不跟随符号链接。', 403);
      if (i < parents.length - 1) assert(entry.isDirectory(), 'WORKSPACE_PATH_INVALID', '父路径不是目录。');
    }
    return { target, path: normalized, stat: await fs.lstat(target) };
  }
  async function snapshot(path) {
    const item = await locate(path);
    assert(item.stat.isFile(), 'WORKSPACE_NOT_FILE', '请选择普通文件。');
    assert(item.stat.size <= TEXT_LIMIT, 'WORKSPACE_TOO_LARGE', '文本超过 8 MiB，请使用本机编辑器。', 413);
    const handle = await fs.open(item.target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const before = await handle.stat(), bytes = await handle.readFile(), after = await handle.stat();
      assert(before.ino === item.stat.ino && before.dev === item.stat.dev && before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs, 'WORKSPACE_CONFLICT', '读取时文件发生变化，请重试。', 409);
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
      catch { throw problem('WORKSPACE_BINARY', '此文件不是 UTF-8 文本，可查看图片或在本机打开。', 415); }
      assert(!text.includes('\0'), 'WORKSPACE_BINARY', '此文件是二进制文件。', 415);
      const policy = filePolicy(item.path);
      return { path: item.path, text, version: digest(bytes), size: bytes.length, modifiedAt: after.mtime.toISOString(), policy, writable: policy === 'editable' || (policy === 'system' && unlocked.has(item.path)), stat: after };
    } finally { await handle.close(); }
  }
  function editable(path) { const policy = filePolicy(path); assert(policy === 'editable' || (policy === 'system' && unlocked.has(path)), 'WORKSPACE_READONLY', '文件只读；系统源码可按文件解锁。', 403); }
  async function lockKey(path) {
    let folder = dirname(resolve(root, path));
    while (inside(root, folder)) {
      try { await fs.lstat(join(folder, '.git')); return folder; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (folder === root) break;
      folder = dirname(folder);
    }
    return root;
  }
  async function read(path) { const { stat, ...value } = await snapshot(path); return value; }
  async function directoryVersion(path) {
    const item = await locate(path), s = item.stat;
    assert(s.isDirectory(), 'WORKSPACE_NOT_DIRECTORY', '请选择目录。');
    return digest(JSON.stringify([s.dev, s.ino, s.mode, s.mtimeMs, s.ctimeMs, (await fs.readdir(item.target)).sort()]));
  }
  async function tree(path = '') {
    const item = await locate(path, { content: false });
    assert(item.stat.isDirectory(), 'WORKSPACE_NOT_DIRECTORY', '请选择目录。');
    assert(filePolicy(item.path) !== 'blocked', 'WORKSPACE_PROTECTED', '此目录不开放浏览。', 403);
    const entries = await fs.readdir(item.target, { withFileTypes: true });
    return { path: item.path, version: await directoryVersion(item.path), entries: entries.filter(e => !SKIP.has(e.name) && !e.name.startsWith('.ksf-edit-') && (item.path !== '' || ROOT_ORDER.has(e.name))).map(e => {
      const path = [item.path, e.name].filter(Boolean).join('/');
      return { name: e.name, path, kind: e.isSymbolicLink() ? 'symlink' : e.isDirectory() ? 'directory' : 'file', policy: filePolicy(path) };
    }).sort((a, b) => item.path === '' ? ROOT_ORDER.get(a.name) - ROOT_ORDER.get(b.name) : (a.kind === 'directory' ? 0 : 1) - (b.kind === 'directory' ? 0 : 1) || a.name.localeCompare(b.name, 'zh-CN')) };
  }
  async function save({ path, text, version }, alreadyLocked = false) {
    assert(typeof text === 'string' && Buffer.byteLength(text) <= TEXT_LIMIT && typeof version === 'string', 'WORKSPACE_INPUT_INVALID', '保存需要文本与读取时的版本。');
    const publish = async () => {
      const before = await snapshot(path); editable(before.path);
      if (version !== before.version) throw problem('WORKSPACE_CONFLICT', '磁盘文件已变化，自动保存已暂停。', 409, { disk: await read(path) });
      if (text === before.text) return read(path);
      const item = await locate(path), temp = join(dirname(item.target), `.ksf-edit-${randomUUID()}`);
      try {
        const handle = await fs.open(temp, 'wx', before.stat.mode & 0o777);
        try { await handle.writeFile(text, 'utf8'); await handle.sync(); } finally { await handle.close(); }
        const latest = await snapshot(path);
        assert(latest.version === version && latest.stat.ino === before.stat.ino, 'WORKSPACE_CONFLICT', '发布前文件发生变化，已保留编辑草稿。', 409);
        await locate(path);
        await fs.rename(temp, item.target);
        return read(path);
      } finally { await fs.unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
    };
    return alreadyLocked ? publish() : coordinator.run(await lockKey(path), publish);
  }
  async function create({ path, kind = 'file', text = '' }, alreadyLocked = false) {
    assert(['file', 'directory'].includes(kind) && typeof text === 'string' && Buffer.byteLength(text) <= TEXT_LIMIT, 'WORKSPACE_INPUT_INVALID', '无效的新建内容。');
    const publish = async () => {
      const item = await locate(path, { missing: true });
      assert(item.path && !item.stat, 'WORKSPACE_EXISTS', '目标已存在。', 409); editable(item.path);
      if (kind === 'directory') await fs.mkdir(item.target);
      else await fs.writeFile(item.target, text, { flag: 'wx', mode: 0o644 });
      return { path: item.path, kind };
    };
    return alreadyLocked ? publish() : coordinator.run(await lockKey(path), publish);
  }
  async function move({ path, destination, version }) {
    // A workspace-level queue additionally serializes cross-repository moves.
    return coordinator.runMany([await lockKey(path), await lockKey(destination)], async () => {
      const source = await locate(path), target = await locate(destination, { missing: true });
      editable(source.path); editable(target.path);
      assert(source.path && target.path && (source.stat.isFile() || source.stat.isDirectory()), 'WORKSPACE_MOVE_INVALID', '请选择普通文件或目录。');
      assert(!target.stat, 'WORKSPACE_EXISTS', '目标已存在。', 409);
      if (source.stat.isDirectory()) {
        assert(!['项目', '知识', '能力', '档案', 'repositories'].includes(source.path.toLowerCase()) && !target.path.startsWith(source.path + '/'), 'WORKSPACE_MOVE_INVALID', '不能移动 KSF 根分区，或把目录移动到自身内部。');
        let visited = 0;
        const inspect = async (folder, destination) => {
          assert(++visited <= 50000, 'WORKSPACE_TOO_LARGE', '目录超过 50,000 项，请使用本机文件管理器。', 413);
          const item = await locate(folder);
          assert(filePolicy(folder) === 'editable' && filePolicy(destination) === 'editable', 'WORKSPACE_MOVE_PROTECTED', '目录包含仓库、系统或受保护内容，不能整体移动。', 403);
          assert(item.stat.isFile() || item.stat.isDirectory(), 'WORKSPACE_MOVE_INVALID', '目录只能包含普通文件与目录。');
          if (item.stat.isDirectory()) for (const name of await fs.readdir(item.target)) await inspect(`${folder}/${name}`, `${destination}/${name}`);
        };
        assert(typeof version === 'string' && await directoryVersion(path) === version, 'WORKSPACE_CONFLICT', '目录已变化，请重新选择。', 409);
        await inspect(source.path, target.path);
        assert(await directoryVersion(path) === version, 'WORKSPACE_CONFLICT', '检查期间目录已变化。', 409);
        let reservation;
        try {
          // POSIX rename may replace an empty target. Reserve it exclusively so
          // an existing directory is never overwritten; Windows rejects it itself.
          reservation = await platform.reserveDirectoryRename(target.target);
          const latest = await locate(path), destinationNow = await locate(destination, { missing: true });
          assert(reservation ? destinationNow.stat?.ino === reservation.ino && destinationNow.stat.dev === reservation.dev : !destinationNow.stat, 'WORKSPACE_EXISTS', '目标目录已变化。', 409);
          assert(latest.stat.ino === source.stat.ino && await directoryVersion(path) === version, 'WORKSPACE_CONFLICT', '移动前目录已变化。', 409);
          await fs.rename(source.target, target.target);
          reservation = null;
        } finally {
          if (reservation) { const current = await fs.lstat(target.target).catch(() => null); if (current?.ino === reservation.ino && current.dev === reservation.dev) await fs.rmdir(target.target).catch(() => {}); }
        }
        return { path: target.path, previousPath: source.path, kind: 'directory' };
      }
      assert(typeof version === 'string' && (await snapshot(path)).version === version, 'WORKSPACE_CONFLICT', '移动前文件已变化。', 409);
      // Hard link provides exclusive publication, unlike rename which overwrites.
      await fs.link(source.target, target.target);
      try { const latest = await snapshot(path); assert(latest.version === version && latest.stat.ino === source.stat.ino, 'WORKSPACE_CONFLICT', '移动时原文件已变化。', 409); await fs.unlink(source.target); } catch (error) { await fs.unlink(target.target); throw error; }
      return { path: target.path, previousPath: source.path };
    });
  }
  async function search({ q = '', path = '' } = {}) {
    assert(typeof q === 'string' && q.trim() && q.length <= 200, 'WORKSPACE_QUERY_INVALID', '搜索内容为 1–200 个字符。');
    const start = await locate(path), matches = [], errors = [], needle = q.toLocaleLowerCase();
    let visited = 0, truncated = false;
    async function walk(folder) {
      for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
        if (SKIP.has(entry.name) || entry.isSymbolicLink() || entry.name.startsWith('.ksf-edit-')) continue;
        if (++visited > 30000 || matches.length >= 200) { truncated = true; return; }
        const absolute = join(folder, entry.name), path = display(absolute);
        if (filePolicy(path) === 'blocked') continue;
        if (entry.isDirectory()) { await walk(absolute).catch(() => errors.push({ path, message: '目录无法读取' })); if (truncated) return; }
        else if (entry.isFile()) {
          const nameMatch = entry.name.toLocaleLowerCase().includes(needle);
          if (!/\.(md|markdown|txt|json|ya?ml|[cm]?js|tsx?|css|html|toml|ini|csv)$/i.test(entry.name)) { if (nameMatch) matches.push({ path, line: 0, text: entry.name }); continue; }
          try {
            const stat = await fs.lstat(absolute); if (stat.size > 1024 * 1024) { if (nameMatch) matches.push({ path, line: 0, text: entry.name }); continue; }
            const file = await read(path), lines = file.text.split(/\r?\n/); let found = false;
            for (let n = 0; n < lines.length && matches.length < 200; n++) if (lines[n].toLocaleLowerCase().includes(needle)) { matches.push({ path, line: n + 1, text: lines[n].slice(0, 300) }); found = true; }
            if (nameMatch && !found) matches.push({ path, line: 0, text: entry.name });
          } catch (error) { if (!['WORKSPACE_BINARY', 'WORKSPACE_TOO_LARGE'].includes(error.code)) errors.push({ path, message: '文件无法读取' }); }
        }
      }
    }
    assert(start.stat.isDirectory(), 'WORKSPACE_NOT_DIRECTORY', '搜索范围必须是目录。');
    await walk(start.target); return { matches, errors, truncated, visited };
  }
  async function media(path) {
    const item = await locate(path);
    const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
    const type = types[item.path.slice(item.path.lastIndexOf('.')).toLowerCase()];
    assert(type && item.stat.isFile() && item.stat.size <= 20 * 1024 * 1024, 'WORKSPACE_MEDIA_INVALID', '支持 20 MiB 内的 PNG、JPEG、WebP、GIF 图片。', 415);
    const handle = await fs.open(item.target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try { const s = await handle.stat(); assert(s.ino === item.stat.ino && s.dev === item.stat.dev, 'WORKSPACE_CONFLICT', '图片已变化。', 409); return { bytes: await handle.readFile(), type }; } finally { await handle.close(); }
  }
  async function upload({ path, name, base64 }) {
    assert(typeof name === 'string' && /\.(png|jpe?g|gif|webp)$/i.test(name) && typeof base64 === 'string' && base64.length <= 28 * 1024 * 1024 && /^[A-Za-z0-9+/]*={0,2}$/.test(base64), 'WORKSPACE_MEDIA_INVALID', '请选择 PNG、JPEG、WebP 或 GIF 图片。');
    return coordinator.run(await lockKey(path), async () => {
    const file = await read(path); editable(file.path);
    const folder = posix.join(posix.dirname(file.path), 'assets');
    const parent = await locate(folder, { missing: true });
    if (!parent.stat) await fs.mkdir(parent.target);
    const extension = name.split('.').pop().toLowerCase(), imagePath = posix.join(folder, `${Date.now()}-${randomUUID().slice(0, 8)}.${extension}`);
    const bytes = Buffer.from(base64, 'base64'); assert(bytes.length > 0 && bytes.length <= 20 * 1024 * 1024, 'WORKSPACE_TOO_LARGE', '图片超过 20 MiB。', 413);
    const target = await locate(imagePath, { missing: true }); editable(imagePath);
    await fs.writeFile(target.target, bytes, { flag: 'wx', mode: 0o644 });
    return { path: imagePath, relativePath: posix.relative(posix.dirname(file.path), imagePath) };
    });
  }
  return { root, instanceId: digest(root), locate, lockKey, tree, read, save, saveUnlocked: input => save(input, true), create, createUnlocked: input => create(input, true), move, search, media, upload,
    async unlock({ path }) { const item = await locate(path); assert(item.stat.isFile() && filePolicy(item.path) === 'system', 'WORKSPACE_UNLOCK_INVALID', '只有普通系统源码文件可以解锁。', 403); unlocked.add(item.path); return read(item.path); },
  };
}
