import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { readFile, writeFile, mkdir, rename, rm, lstat, open } from 'node:fs/promises';
import { readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, problem, createCoordinator } from '../services/workbench-common.js';
import { assertCompatible, validateManifest, validPath, checksum, decodePackage, MAX_PACKAGE, compareVersions, sameManifest } from './protocol.js';

const bundledStore = fileURLToPath(new URL('../../../applications/store/', import.meta.url));
const hostPath = fileURLToPath(new URL('./host.js', import.meta.url));
const uuid = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
function sourceURL(value) {
  let url; try { url = new URL(value); } catch { throw problem('APP_SOURCE_INVALID', '请填写完整的 HTTP(S) 应用索引地址。'); }
  assert(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash, 'APP_SOURCE_INVALID', '应用源只支持不含账号密码的 HTTP(S) 地址。');
  return url.href;
}
async function boundedFetch(url, limit, fetcher) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(15000), redirect: 'error', headers: { Accept: 'application/json, application/octet-stream' } });
  assert(response.ok, 'APP_SOURCE_UNAVAILABLE', `应用源返回 HTTP ${response.status}。`, 502);
  assert(Number(response.headers.get('content-length') ?? 0) <= limit, 'APP_DOWNLOAD_TOO_LARGE', '下载内容超过大小上限。');
  const chunks = []; let length = 0;
  try { for await (const chunk of response.body) { length += chunk.length; assert(length <= limit, 'APP_DOWNLOAD_TOO_LARGE', '下载内容超过大小上限。'); chunks.push(Buffer.from(chunk)); } }
  catch (error) { await response.body?.cancel?.().catch(() => {}); throw error; }
  return Buffer.concat(chunks);
}
// Config and immutable installed packages belong to the workspace, outside Core updates.
export function createApplicationManager(root, { storeDirectory = bundledStore, fetcher = fetch } = {}) {
  const home = join(root, '.agents/user-data/applications'), statePath = join(home, 'state.json');
  const runtimeHome = join(root, '.agents/runtime-data/applications/instances');
  const coordinator = createCoordinator(), instances = new Map(), logs = new Map();
  let disposed = false;
  const initial = () => ({ schemaVersion: 1, revision: 0, sources: [{ id: 'builtin', name: 'KSF 默认应用源', url: 'builtin:', enabled: true }], installed: {} });
  async function readState() {
    try {
      const stat = await lstat(statePath); assert(stat.isFile() && !stat.isSymbolicLink(), 'APP_STATE_INVALID', '应用配置必须是普通文件。');
      const value = JSON.parse(await readFile(statePath, 'utf8'));
      assert(value.schemaVersion === 1 && Number.isSafeInteger(value.revision) && Array.isArray(value.sources) && value.installed && typeof value.installed === 'object', 'APP_STATE_INVALID', '应用配置损坏，请保留文件并恢复备份。');
      for (const record of Object.values(value.installed)) for (const release of [record.active, record.pending, record.previous].filter(Boolean)) { validateManifest(release.manifest); assert(/^[a-f0-9]{64}$/.test(release.digest), 'APP_STATE_INVALID', '已安装应用路径无效。'); }
      return value;
    } catch (error) { if (error.code === 'ENOENT') return initial(); throw error; }
  }
  async function withStateLock(action) {
    return coordinator.run('state', async () => {
      await mkdir(home, { recursive: true, mode: 0o700 });
      let lock; const lockPath = join(home, '.lock');
      for (let attempt = 0; attempt < 2; attempt++) {
        try { lock = await open(lockPath, 'wx', 0o600); await lock.writeFile(JSON.stringify({ pid: process.pid, nonce: randomUUID() })); break; }
        catch (error) {
          if (error.code !== 'EEXIST') throw error;
          let stale = false, previous;
          try { previous = await readFile(lockPath, 'utf8'); const owner = JSON.parse(previous); if (Number.isSafeInteger(owner.pid) && owner.pid > 0) { try { process.kill(owner.pid, 0); } catch (probe) { stale = probe.code === 'ESRCH'; } } } catch {}
          if (attempt === 0 && stale && await readFile(lockPath, 'utf8').catch(() => '') === previous) { await rm(lockPath, { force: true }); continue; }
          throw problem('APP_BUSY', '另一个应用管理操作正在进行，或锁的归属无法确认，请稍后重试。', 409);
        }
      }
      try {
        return await action();
      } finally { await lock.close(); await rm(lockPath, { force: true }); }
    });
  }
  async function mutate(action) {
    return withStateLock(async () => {
      const temporary = `${statePath}.${randomUUID()}.tmp`;
      try { const state = await readState(), result = await action(state); state.revision++; await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 }); await rename(temporary, statePath); return result; }
      finally { await rm(temporary, { force: true }); }
    });
  }
  const directory = release => join(home, 'packages', release.manifest.id, release.digest);
  const running = id => {
    const local = [...instances.values()].filter(item => item.appId === id && !item.closed), known = new Set(instances.keys());
    let names = []; try { names = readdirSync(runtimeHome); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const name of names.filter(name => /^[a-f0-9-]{36}\.json$/.test(name))) {
      if (known.has(name.slice(0, -5))) continue;
      let item; try { item = JSON.parse(readFileSync(join(runtimeHome, name), 'utf8')); } catch { continue; }
      if (item.appId !== id || !Number.isSafeInteger(item.ownerPid)) continue;
      try { process.kill(item.ownerPid, 0); local.push({ ...item, foreign: true }); } catch (error) { if (error.code !== 'ESRCH') local.push({ ...item, foreign: true }); }
    }
    return local;
  };
  async function settlePending(state, id) {
    const item = state.installed[id];
    if (item?.pending && !running(id).length) { item.previous = item.active; item.active = item.pending; item.pending = null; }
  }
  async function snapshot() {
    const state = await readState();
    // If Core stopped while an upgrade waited, no old application instance survives it.
    if (Object.entries(state.installed).some(([id, app]) => app.pending && !running(id).length)) await mutate(async next => { for (const id of Object.keys(next.installed)) await settlePending(next, id); });
    const current = await readState();
    return { revision: current.revision, sources: current.sources, installed: Object.entries(current.installed).map(([id, item]) => ({ id, ...item, running: running(id).length, assetBase: `/app-assets/${id}/${item.active.digest}/` })), instances: [...instances.values()].map(item => ({ id: item.id, appId: item.appId, digest: item.release.digest, status: item.closed ? 'stopped' : 'running', error: item.error ?? null })) };
  }
  async function index(source) {
    const bytes = source.id === 'builtin' ? await readFile(join(storeDirectory, 'index.json')) : await boundedFetch(sourceURL(source.url), 2 * 1024 * 1024, fetcher);
    let value; try { value = JSON.parse(bytes); } catch { throw problem('APP_SOURCE_INVALID', '应用源索引不是有效 JSON。'); }
    assert(value.protocol === 'ksf-app-registry-v1' && Array.isArray(value.apps) && value.apps.length <= 500, 'APP_SOURCE_INVALID', '应用源索引格式无效。');
    const found = new Set();
    return value.apps.map(item => {
      validateManifest(item.manifest);
      assert(item.package && /^[a-f0-9]{64}$/.test(item.package.sha256) && typeof item.package.url === 'string' && Number.isSafeInteger(item.package.size) && item.package.size > 0 && item.package.size <= MAX_PACKAGE, 'APP_SOURCE_INVALID', '应用包地址、摘要或大小无效。');
      const key = `${item.manifest.id}@${item.manifest.version}:${item.manifest.target ?? '*'}:${item.manifest.nodeAbi ?? '*'}`; assert(!found.has(key), 'APP_SOURCE_INVALID', '应用源包含重复版本。'); found.add(key);
      if (source.id === 'builtin') assert(/^[a-zA-Z0-9_.-]+\.ksfapp$/.test(item.package.url), 'APP_SOURCE_INVALID', '默认源的应用包地址无效。');
      else sourceURL(new URL(item.package.url, source.url).href);
      let incompatibility = null; try { assertCompatible(item.manifest); } catch (error) { incompatibility = error.message; }
      return { ...item, source: { ...source }, incompatibility };
    });
  }
  async function catalog() {
    const state = await readState(), apps = [], errors = [];
    await Promise.all(state.sources.filter(s => s.enabled).map(async source => { try { apps.push(...await index(source)); } catch (error) { errors.push({ sourceId: source.id, name: source.name, message: error.message }); } }));
    const variants = new Map();
    for (const item of apps) { const key = `${item.source.id}:${item.manifest.id}:${item.manifest.version}`, previous = variants.get(key); if (!previous || previous.incompatibility && !item.incompatibility) variants.set(key, item); }
    const selected = [...variants.values()]; selected.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name) || compareVersions(b.manifest.version, a.manifest.version));
    return { apps: selected, errors };
  }
  async function saveSource(input) {
    return mutate(state => {
      assert(typeof input.name === 'string' && input.name.trim().length > 0 && input.name.trim().length <= 80 && typeof input.enabled === 'boolean', 'APP_SOURCE_INVALID', '应用源名称或启用状态无效。');
      if (input.id === 'builtin') { state.sources[0] = { ...state.sources[0], name: input.name.trim(), enabled: input.enabled }; return; }
      const url = sourceURL(input.url), id = input.id ?? randomUUID();
      assert(uuid(id) && !state.sources.some(s => s.url === url && s.id !== id), 'APP_SOURCE_INVALID', '应用源已存在或标识无效。');
      const item = { id, name: input.name.trim(), url, enabled: input.enabled }, at = state.sources.findIndex(s => s.id === id);
      if (at < 0) { assert(!input.id && state.sources.length < 32, 'APP_SOURCE_INVALID', '应用源不存在或已达到数量上限。'); state.sources.push(item); } else state.sources[at] = item;
      return item;
    });
  }
  async function removeSource(id) { return mutate(state => { assert(id !== 'builtin' && state.sources.some(s => s.id === id), 'APP_SOURCE_INVALID', '无法移除此应用源。'); state.sources = state.sources.filter(s => s.id !== id); }); }
  async function install(input) {
    assert(input.trusted === true && /^[a-f0-9]{64}$/.test(input.digest), 'APP_TRUST_REQUIRED', '请先核对应用来源和权限，并确认信任此应用。');
    const before = await readState(), source = before.sources.find(s => s.id === input.sourceId && s.enabled);
    assert(source, 'APP_SOURCE_MISSING', '应用源已移除或停用，请刷新商店。', 409);
    const item = (await index(source)).find(i => i.manifest.id === input.appId && i.manifest.version === input.version && i.package.sha256 === input.digest);
    assert(item, 'APP_RELEASE_CHANGED', '应用源中的版本已变化，请刷新并重新核对。', 409); assertCompatible(item.manifest);
    const bytes = source.id === 'builtin' ? await readFile(join(storeDirectory, item.package.url)) : await boundedFetch(sourceURL(new URL(item.package.url, source.url).href), MAX_PACKAGE, fetcher);
    assert(bytes.length === item.package.size && checksum(bytes) === item.package.sha256, 'APP_PACKAGE_INTEGRITY', '应用包大小或 SHA256 校验失败。');
    const decoded = decodePackage(bytes); assert(sameManifest(decoded.manifest, item.manifest), 'APP_PACKAGE_INTEGRITY', '应用包与安装前展示的声明不一致。');
    const release = { manifest: decoded.manifest, digest: item.package.sha256, source: { id: source.id, name: source.name, url: source.url }, installedAt: new Date().toISOString() };
    const target = directory(release), staging = join(home, 'staging', randomUUID());
    await mkdir(staging, { recursive: true, mode: 0o700 });
    try {
      for (const [path, file] of decoded.files) { const out = join(staging, path); await mkdir(dirname(out), { recursive: true, mode: 0o700 }); await writeFile(out, file.data, { mode: file.mode }); }
      await writeFile(join(staging, 'release.json'), JSON.stringify({ release, files: Object.fromEntries([...decoded.files].map(([path, file]) => [path, { sha256: file.sha256, mode: file.mode }])) }), { mode: 0o600 });
      return await mutate(async state => {
        assert(state.sources.some(s => s.id === source.id && s.enabled && s.url === source.url), 'APP_SOURCE_CHANGED', '安装期间应用源配置已变化，请重试。', 409);
        const existing = state.installed[input.appId];
        assert(!existing || existing.active.digest === release.digest || existing.active.manifest.version !== release.manifest.version, 'APP_VERSION_REUSED', '同一版本号对应不同内容，请让开发者发布新版本。', 409);
        await mkdir(dirname(target), { recursive: true, mode: 0o700 });
        try { await rename(staging, target); } catch (error) { if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error; await verifyRelease(release); }
        const previous = existing ?? { enabled: true, active: release, previous: null, pending: null };
        if (existing?.active.digest !== release.digest && running(input.appId).length) previous.pending = release;
        else { if (existing?.active.digest !== release.digest) previous.previous = previous.active; previous.active = release; previous.pending = null; }
        state.installed[input.appId] = previous;
        return { pending: !!previous.pending, release };
      });
    } finally { await rm(staging, { recursive: true, force: true }); }
  }
  async function verifyRelease(release) {
    const base = directory(release), info = JSON.parse(await readFile(join(base, 'release.json'), 'utf8'));
    assert(info.release.digest === release.digest && sameManifest(info.release.manifest, release.manifest), 'APP_PACKAGE_INTEGRITY', '已安装应用的声明已改变，请重新安装。');
    for (const [path, file] of Object.entries(info.files)) {
      assert(validPath(path), 'APP_PACKAGE_INTEGRITY', '已安装应用路径无效。');
      let current = base;
      for (const part of path.split('/')) { current = join(current, part); assert(!(await lstat(current)).isSymbolicLink(), 'APP_PACKAGE_INTEGRITY', '已安装应用不能包含符号链接。'); }
      assert(checksum(await readFile(current)) === file.sha256, 'APP_PACKAGE_INTEGRITY', '已安装应用的文件完整性校验失败。');
    }
    return info;
  }
  async function asset(id, digest, path) {
    assert(validPath(path) && path.startsWith('frontend/') && /\.(m?js|css|svg|png|jpe?g|woff2?|ttf|json|txt)$/.test(path), 'APP_ASSET_NOT_FOUND', '应用资源不存在。', 404);
    const state = await readState(), app = state.installed[id];
    const release = [app?.active, app?.pending, app?.previous, ...running(id).map(i => i.release)].find(r => r?.digest === digest);
    assert(release && app.enabled, 'APP_ASSET_NOT_FOUND', '应用资源不存在。', 404);
    const base = directory(release), info = JSON.parse(await readFile(join(base, 'release.json'), 'utf8'));
    assert(info.files[path], 'APP_ASSET_NOT_FOUND', '应用资源不在已安装清单中。', 404);
    let file = base; for (const part of path.split('/')) { file = join(file, part); assert(!(await lstat(file)).isSymbolicLink(), 'APP_PACKAGE_INTEGRITY', '应用资源路径无效。'); }
    const bytes = await readFile(file); assert(checksum(bytes) === info.files[path].sha256, 'APP_PACKAGE_INTEGRITY', '应用资源完整性校验失败。');
    const ext = path.split('.').at(-1), types = { js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', json: 'application/json', txt: 'text/plain' };
    return { bytes, type: types[ext] };
  }
  async function launch(appId, digest) {
    assert(!disposed, 'APP_HOST_CLOSED', '应用宿主已停止。', 503);
    return withStateLock(async () => {
      assert(!disposed, 'APP_HOST_CLOSED', '应用宿主已停止。', 503);
      const state = await readState(), app = state.installed[appId];
      assert(app?.enabled && app.active.digest === digest, 'APP_RELEASE_CHANGED', '应用已更新或停用，请重新打开。', 409); assertCompatible(app.active.manifest); await verifyRelease(app.active);
      for (const [id, item] of instances) if (item.closed) instances.delete(id);
      assert(instances.size < 32, 'APP_INSTANCE_LIMIT', '应用实例已达到上限，请先关闭部分窗口。');
      const id = randomUUID(), instance = { id, appId, release: app.active, closed: false, calls: new Map(), next: 0, lastSeen: Date.now() };
      instances.set(id, instance);
      await mkdir(runtimeHome, { recursive: true, mode: 0o700 });
      await writeFile(join(runtimeHome, `${id}.json`), JSON.stringify({ id, appId, digest, ownerPid: process.pid, createdAt: new Date().toISOString() }), { mode: 0o600 });
      if (app.active.manifest.backend) {
        const dataDirectory = join(home, 'data', appId); await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
        const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH','HOME','USER','LOGNAME','SHELL','LANG','LC_ALL','LC_CTYPE','TMPDIR','TMP','TEMP','SYSTEMROOT','COMSPEC','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA'].includes(key.toUpperCase())));
        const child = fork(hostPath, [], { execArgv: [], env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], cwd: directory(app.active) }); instance.child = child;
        const log = data => { const entries = logs.get(appId) ?? ''; logs.set(appId, (entries + String(data)).slice(-16000)); };
        child.stdout.on('data', log); child.stderr.on('data', log);
        let resolveReady, rejectReady;
        const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
        const timer = setTimeout(() => rejectReady(problem('APP_START_TIMEOUT', '应用后端启动超时。', 504)), 10000);
        child.on('message', message => {
          if (message.type === 'ready') resolveReady();
          if (message.type === 'failed') rejectReady(problem('APP_START_FAILED', message.message, 502));
          if (message.type === 'result') { const pending = instance.calls.get(message.id); if (pending) { clearTimeout(pending.timer); instance.calls.delete(message.id); message.error ? pending.reject(problem(message.error.code, message.error.message, 400)) : pending.resolve(message.value); } }
        });
        child.on('error', error => { instance.error = error.message; rejectReady(problem('APP_START_FAILED', error.message, 502)); });
        child.on('exit', () => {
          instance.closed = true; instance.error ??= '应用后端已退出，请重新打开窗口。';
          try { unlinkSync(join(runtimeHome, `${id}.json`)); } catch {}
          for (const pending of instance.calls.values()) { clearTimeout(pending.timer); pending.reject(problem('APP_PROCESS_EXITED', instance.error, 502)); } instance.calls.clear();
          rejectReady(problem('APP_PROCESS_EXITED', instance.error, 502));
        });
        child.send({ type: 'init', manifest: app.active.manifest, directory: directory(app.active), dataDirectory, workspace: root });
        try { await ready; } catch (error) { await stopInstance(id); throw error; } finally { clearTimeout(timer); }
      }
      return { id, appId, version: app.active.manifest.version, digest };
    });
  }
  async function call(id, method, params) {
    assert(uuid(id) && typeof method === 'string' && /^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test(method), 'APP_CALL_INVALID', '应用调用参数无效。');
    const instance = instances.get(id); assert(instance && !instance.closed && instance.child?.connected, 'APP_PROCESS_EXITED', '应用后端已停止，请重新打开窗口。', 410);
    assert(JSON.stringify(params ?? null).length <= 1024 * 1024, 'APP_CALL_INVALID', '单次应用调用参数超过大小上限。', 413);
    instance.lastSeen = Date.now(); assert(instance.calls.size < 32, 'APP_BUSY', '应用请求过多，请稍后重试。', 429);
    const next = ++instance.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { instance.calls.delete(next); reject(problem('APP_CALL_TIMEOUT', '应用请求超时。', 504)); }, 20000);
      instance.calls.set(next, { resolve, reject, timer }); instance.child.send({ type: 'call', id: next, method, params }, error => { if (error) { clearTimeout(timer); instance.calls.delete(next); reject(problem('APP_PROCESS_EXITED', '应用进程已退出。', 410)); } });
    });
  }
  async function stopInstance(id) {
    const instance = instances.get(id); if (!instance) return;
    instance.closed = true;
    if (instance.child && instance.child.exitCode === null && instance.child.signalCode === null) {
      await new Promise(resolve => {
        const timer = setTimeout(() => { instance.child.kill('SIGKILL'); }, 1500);
        instance.child.once('exit', () => { clearTimeout(timer); resolve(); });
        if (instance.child.connected) instance.child.send({ type: 'close' }, () => {}); else instance.child.kill('SIGTERM');
      });
    }
    for (const pending of instance.calls.values()) { clearTimeout(pending.timer); pending.reject(problem('APP_PROCESS_EXITED', '应用已关闭。', 410)); }
    instances.delete(id);
    await rm(join(runtimeHome, `${id}.json`), { force: true });
  }
  async function release(id) { const appId = instances.get(id)?.appId; await stopInstance(id); if (appId) await mutate(state => settlePending(state, appId)); }
  // Closing the page releases promptly; leases also clean up disconnected browsers.
  const reaper = setInterval(() => { for (const instance of instances.values()) if (Date.now() - instance.lastSeen > 90000) void release(instance.id).catch(() => {}); }, 15000); reaper.unref();
  async function heartbeat(ids) { for (const id of ids ?? []) { const item = instances.get(id); if (item) item.lastSeen = Date.now(); } return {}; }
  async function changeApp(id, action, force = false) {
    return mutate(async state => {
      const app = state.installed[id]; assert(app, 'APP_NOT_INSTALLED', '应用尚未安装。', 404);
      assert(['uninstall', 'rollback', 'enable', 'disable'].includes(action), 'APP_ACTION_INVALID', '未知应用管理操作。');
      const active = running(id);
      assert(!active.some(item => item.foreign), 'APP_OTHER_HOST_RUNNING', '此应用仍在另一个工作台服务中运行，请先在那里关闭。', 409);
      if (active.length) { assert(force, 'APP_RUNNING', '请先关闭此应用的所有窗口。', 409); for (const item of active) await stopInstance(item.id); }
      if (action === 'uninstall') delete state.installed[id];
      else if (action === 'rollback') { assert(app.previous && !app.pending, 'APP_ROLLBACK_UNAVAILABLE', '没有可回退版本，或已有升级等待切换。'); await verifyRelease(app.previous); const previous = app.previous; app.previous = app.active; app.active = previous; }
      else if (action === 'enable' || action === 'disable') app.enabled = action === 'enable';
      else throw problem('APP_ACTION_INVALID', '未知应用管理操作。');
    });
  }
  async function storeAsset(name) { assert(name === 'index.json' || /^[a-zA-Z0-9_.-]+\.ksfapp$/.test(name), 'APP_ASSET_NOT_FOUND', '应用源资源不存在。', 404); return readFile(join(storeDirectory, name)); }
  async function close() { disposed = true; clearInterval(reaper); await Promise.all([...instances.keys()].map(stopInstance)); }
  return { snapshot, catalog, install, saveSource, removeSource, asset, launch, call, release, heartbeat, changeApp, storeAsset, close };
}
