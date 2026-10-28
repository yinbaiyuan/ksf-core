import {createWorkbenchTerminal} from '../services/workbench-terminal.js';
import {createApplicationStorage} from '../services/application-storage.js';
import { randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { readFile, writeFile, mkdir, rename, rm, lstat, open, readdir } from 'node:fs/promises';
import { readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {atomicJSON,replaceFile,readJSON as readDurableJSON,safeDirectory as ensureDirectory} from '../shared/durable-json.js';
import { fileURLToPath } from 'node:url';
import { assert, problem, createCoordinator } from '../services/workbench-common.js';
import { DEFAULT_APPLICATION_SOURCE, withDefaultApplicationSource } from './default-source.js';
import { assertCompatible, validateManifest, validPath, checksum, decodePackage, MAX_PACKAGE, compareVersions, sameManifest, OFFICIAL_APPLICATIONS,validateStoreListing,groupStoreApplications,storeMediaPath,storeImageType,MAX_STORE_IMAGE } from './protocol.js';

const bundledStore = fileURLToPath(new URL('../../../applications/store/', import.meta.url));
const hostPath = fileURLToPath(new URL('./host.js', import.meta.url));
const invalidBackground=message=>{throw problem('APP_BACKGROUND_INVALID',message);};
const readJSON=(path,fallback)=>readDurableJSON(path,fallback,{invalid:invalidBackground});
const safeDirectory=(root,path)=>ensureDirectory(root,path,{invalid:invalidBackground});
const processMayLive=pid=>{if(!Number.isSafeInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}};
const uuid = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
function sourceURL(value) {
  let url; try { url = new URL(value); } catch { throw problem('APP_SOURCE_INVALID', '请填写完整的 HTTP(S) 应用索引地址。'); }
  assert(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash, 'APP_SOURCE_INVALID', '应用源只支持不含账号密码的 HTTP(S) 地址。');
  return url.href;
}
async function boundedFetch(url, limit, fetcher) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(15000), redirect: 'error', headers: { Accept: 'application/json, application/octet-stream, image/png, image/jpeg, image/webp' } });
  assert(response.ok, 'APP_SOURCE_UNAVAILABLE', `应用源返回 HTTP ${response.status}。`, 502);
  assert(Number(response.headers.get('content-length') ?? 0) <= limit, 'APP_DOWNLOAD_TOO_LARGE', '下载内容超过大小上限。');
  const chunks = []; let length = 0;
  try { for await (const chunk of response.body) { length += chunk.length; assert(length <= limit, 'APP_DOWNLOAD_TOO_LARGE', '下载内容超过大小上限。'); chunks.push(Buffer.from(chunk)); } }
  catch (error) { await response.body?.cancel?.().catch(() => {}); throw error; }
  return Buffer.concat(chunks);
}
// Config and immutable installed packages belong to the workspace, outside Core updates.
export function createApplicationManager(root, { storeDirectory = bundledStore, fetcher = fetch, services = {}, locks = createCoordinator(), callTimeoutMs = 20000, now = Date.now, defaultSource = DEFAULT_APPLICATION_SOURCE } = {}) {
  const home = join(root, '.agents/user-data/applications'), statePath = join(home, 'state.json');
  const terminal=createWorkbenchTerminal(root),storage=createApplicationStorage(root);
  services={...services,terminal,storage};
  const runtimeHome = join(root, '.agents/runtime-data/applications/instances');
  const coordinator = createCoordinator(), instances = new Map(), runtimes = new Map(), logs = new Map();
  // Previewing never executes application code or adds an installation/source.
  const imports = new Map(), importSource = { id: 'local-import', name: '手动导入', url: 'local-import:' };
  const pruneImports = () => { for (const [id, item] of imports) if (item.expiresAt <= now()) imports.delete(id); };
  let disposed = false, bootstrap, backgroundReconcile, backgroundErrors=[];
  const backgroundPath=join(home,'background'),backgroundLocks=createCoordinator(),restartCounts=new Map();
  async function backgroundHolds(){const applications={};for(const name of await readdir(backgroundPath).catch(e=>{if(e.code==='ENOENT')return [];throw e;}))if(/^[a-z][a-z0-9.-]{1,79}\.json$/.test(name)){const value=await readJSON(join(backgroundPath,name));assert(value.schemaVersion===1&&value.holds&&typeof value.holds==='object'&&!Array.isArray(value.holds),'APP_BACKGROUND_INVALID','持久运行需求损坏，请保留原件。');applications[name.slice(0,-5)]=value.holds;}return {schemaVersion:1,applications};}
  const holdCount=async appId=>Object.keys((await backgroundHolds()).applications[appId]??{}).length;
  function reconcileBackground(){if(disposed)return;clearTimeout(backgroundReconcile);backgroundReconcile=setTimeout(()=>{void startBackground().catch(error=>{backgroundErrors=[{code:error.code??'APP_START_FAILED',message:'应用后台启动失败，请重试并检查诊断。'}];});},0);backgroundReconcile.unref();}
  const initial = () => ({ schemaVersion: 1, revision: 0, sources: withDefaultApplicationSource([{ id: 'builtin', name: 'KSF 随附应用', url: 'builtin:', enabled: true }], defaultSource), installed: {} });
  async function readState() {
    try {
      const stat = await lstat(statePath); assert(stat.isFile() && !stat.isSymbolicLink(), 'APP_STATE_INVALID', '应用配置必须是普通文件。');
      const value = JSON.parse(await readFile(statePath, 'utf8'));
      assert(value.schemaVersion === 1 && Number.isSafeInteger(value.revision) && Array.isArray(value.sources) && value.installed && typeof value.installed === 'object', 'APP_STATE_INVALID', '应用配置损坏，请保留文件并恢复备份。');
      for (const record of Object.values(value.installed)) for (const release of [record.active, record.pending, record.previous].filter(Boolean)) { validateManifest(release.manifest); assert(/^[a-f0-9]{64}$/.test(release.digest), 'APP_STATE_INVALID', '已安装应用路径无效。'); }
      value.sources = withDefaultApplicationSource(value.sources, defaultSource);
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
      try { const state = await readState(), result = await action(state); state.revision++; await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 }); await replaceFile(temporary, statePath); reconcileBackground(); return result; }
      finally { await rm(temporary, { force: true }); }
    });
  }
  const directory = release => join(home, 'packages', release.manifest.id, release.digest);
  const running = id => {
    const local = [...instances.values()].filter(item => item.appId === id && !item.closed), known = new Set([...instances.keys(),...[...runtimes.values()].map(runtime=>runtime.id)]);
    let names = []; try { names = readdirSync(runtimeHome); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const name of names.filter(name => /^[a-f0-9-]{36}\.json$/.test(name))) {
      if (known.has(name.slice(0, -5))) continue;
      let item; try { item = JSON.parse(readFileSync(join(runtimeHome, name), 'utf8')); } catch { continue; }
      if (item.appId !== id || !Number.isSafeInteger(item.ownerPid)) continue;
      if(processMayLive(item.ownerPid)||processMayLive(item.childPid))local.push({...item,foreign:true});
    }
    return local;
  };
  async function settlePending(state, id) {
    const item = state.installed[id];
    if (!item?.pending) return;
    const active=running(id);
    if(active.some(lease=>lease.foreign||lease.kind!=='card')||[...runtimes.values()].some(runtime=>runtime.appId===id&&(runtime.jobs.size||runtime.calls.size)))return;
    // Cards are replaceable surfaces: drain together, then publish the new release.
    for(const lease of active)await stopInstance(lease.id);
    for(const runtime of [...runtimes.values()])if(runtime.appId===id)await stopRuntime(runtime);
    item.previous=item.active;item.active=item.pending;item.pending=null;
  }
  async function snapshot() {
    await ensureDefaults();
    const state = await readState();
    // If Core stopped while an upgrade waited, no old application instance survives it.
    if (Object.entries(state.installed).some(([id, app]) => app.pending)) await mutate(async next => { for (const id of Object.keys(next.installed)) await settlePending(next, id); });
    const current = await readState();
    return { revision: current.revision, sources: current.sources, installed: Object.entries(current.installed).map(([id, item]) => ({ id, ...item, running: running(id).length, assetBase: `/app-assets/${id}/${item.active.digest}/` })), instances: [...instances.values()].map(item => ({ id: item.id, appId: item.appId, digest: item.release.digest, status: item.closed ? 'stopped' : 'running', kind:item.kind, pageId:item.pageId, error: item.error ?? null })) };
  }
  async function index(source) {
    const bytes = source.id === 'builtin' ? await readFile(join(storeDirectory, 'index.json')) : await boundedFetch(sourceURL(source.url), 2 * 1024 * 1024, fetcher);
    let value; try { value = JSON.parse(bytes); } catch { throw problem('APP_SOURCE_INVALID', '应用源索引不是有效 JSON。'); }
    assert(value.protocol === 'ksf-app-registry-v1' && Array.isArray(value.apps) && value.apps.length <= 500, 'APP_SOURCE_INVALID', '应用源索引格式无效。');
    const found = new Set();
    return value.apps.map(item => {
      validateManifest(item.manifest);
      validateStoreListing(item.listing);
      assert(!OFFICIAL_APPLICATIONS.includes(item.manifest.id)||source.id==='builtin','APP_ID_RESERVED','此应用标识仅供 KSF 随包应用使用。');
      assert(item.package && /^[a-f0-9]{64}$/.test(item.package.sha256) && typeof item.package.url === 'string' && Number.isSafeInteger(item.package.size) && item.package.size > 0 && item.package.size <= MAX_PACKAGE, 'APP_SOURCE_INVALID', '应用包地址、摘要或大小无效。');
      const key = `${item.manifest.id}@${item.manifest.version}:${item.manifest.target ?? '*'}:${item.manifest.nodeAbi ?? '*'}`; assert(!found.has(key), 'APP_SOURCE_INVALID', '应用源包含重复版本。'); found.add(key);
      if (source.id === 'builtin') assert(/^[a-zA-Z0-9_.-]+\.ksfapp$/.test(item.package.url), 'APP_SOURCE_INVALID', '默认源的应用包地址无效。');
      else sourceURL(new URL(item.package.url, source.url).href);
      let incompatibility = null; try { assertCompatible(item.manifest); } catch (error) { incompatibility = error.message; }
      return { ...item, source: { ...source }, incompatibility };
    });
  }
  async function catalog() {
    await ensureDefaults();
    const state = await readState(), apps = [], errors = [];
    await Promise.all(state.sources.filter(s => s.enabled).map(async source => { try { apps.push(...await index(source)); } catch (error) { errors.push({ sourceId: source.id, name: source.name, message: error.message }); } }));
    const variants = new Map();
    for (const item of apps) { const key = `${item.source.id}:${item.manifest.id}:${item.manifest.version}`, previous = variants.get(key); if (!previous || previous.incompatibility && !item.incompatibility || !previous.incompatibility && !item.incompatibility && (Number(!!item.manifest.target)*2+Number(!!item.manifest.nodeAbi))>(Number(!!previous.manifest.target)*2+Number(!!previous.manifest.nodeAbi))) variants.set(key, item); }
    const selected = [...variants.values()]; selected.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name) || compareVersions(b.manifest.version, a.manifest.version));
    const applications=groupStoreApplications(selected,state.sources,state.installed,errors).map(app=>state.installed[app.appId]?.active.source.id==='local-import'?{...app,candidate:null,latestPublishedVersion:null,unavailableReason:null}:app);
    return { apps: selected, applications,errors };
  }
  async function saveSource(input) {
    assert(!defaultSource || input.id !== defaultSource.id, 'APP_SOURCE_LOCKED', 'KSF 公共默认应用源不可编辑或停用。', 403);
    return mutate(state => {
      assert(typeof input.name === 'string' && input.name.trim().length > 0 && input.name.trim().length <= 80 && typeof input.enabled === 'boolean', 'APP_SOURCE_INVALID', '应用源名称或启用状态无效。');
      if (input.id === 'builtin') { const at=state.sources.findIndex(source=>source.id==='builtin');assert(at>=0,'APP_SOURCE_INVALID','随附应用源不存在。');state.sources[at] = { ...state.sources[at], name: input.name.trim(), enabled: input.enabled }; return; }
      const url = sourceURL(input.url), id = input.id ?? randomUUID();
      assert(uuid(id) && !state.sources.some(s => s.url === url && s.id !== id), 'APP_SOURCE_INVALID', '应用源已存在或标识无效。');
      const item = { id, name: input.name.trim(), url, enabled: input.enabled }, at = state.sources.findIndex(s => s.id === id);
      if (at < 0) { assert(!input.id && state.sources.length < 32, 'APP_SOURCE_INVALID', '应用源不存在或已达到数量上限。'); state.sources.push(item); } else state.sources[at] = item;
      return item;
    });
  }
  async function removeSource(id) { assert(!defaultSource || id !== defaultSource.id, 'APP_SOURCE_LOCKED', 'KSF 公共默认应用源不可移除。', 403);return mutate(state => { assert(id !== 'builtin' && state.sources.some(s => s.id === id), 'APP_SOURCE_INVALID', '无法移除此应用源。'); state.sources = state.sources.filter(s => s.id !== id); }); }
  async function install(input, { bundled = false } = {}) {
    assert(input.trusted === true && /^[a-f0-9]{64}$/.test(input.digest), 'APP_TRUST_REQUIRED', '请先核对应用来源和权限，并确认信任此应用。');
    const before = await readState(), source = before.sources.find(s => s.id === input.sourceId && (s.enabled || bundled && s.id === 'builtin'));
    assert(source, 'APP_SOURCE_MISSING', '应用源已移除或停用，请刷新商店。', 409);
    const sourceEntries=await index(source),item = sourceEntries.find(i => i.manifest.id === input.appId && i.manifest.version === input.version && i.package.sha256 === input.digest);
    assert(item, 'APP_RELEASE_CHANGED', '应用源中的版本已变化，请刷新并重新核对。', 409); assertCompatible(item.manifest);
    const installed=before.installed[input.appId];
    assert(!installed || installed.active.source.id===source.id,'APP_SOURCE_CHANGED','更新须使用原安装源；更换来源请先卸载并核对数据兼容。',409);
    const eligible=sourceEntries.filter(e=>e.manifest.id===input.appId&&!e.incompatibility).sort((a,b)=>compareVersions(b.manifest.version,a.manifest.version)||Number(!!b.manifest.target)-Number(!!a.manifest.target)||Number(!!b.manifest.nodeAbi)-Number(!!a.manifest.nodeAbi));
    assert(eligible[0]?.package.sha256===item.package.sha256 && (!installed||compareVersions(item.manifest.version,installed.pending?.manifest.version??installed.active.manifest.version)>=0),'APP_RELEASE_CHANGED','此版本已不是最新兼容版本，请刷新商店后重新核对。',409);
    if(!installed&&!bundled){const others=(await Promise.all(before.sources.filter(s=>s.enabled&&s.id!==source.id).map(s=>index(s).catch(()=>[])))).flat();assert(!others.some(e=>e.manifest.id===input.appId&&!e.incompatibility&&compareVersions(e.manifest.version,item.manifest.version)>0),'APP_RELEASE_CHANGED','已有更高的兼容版本，请刷新商店后重新核对来源。',409);}
    const bytes = source.id === 'builtin' ? await readFile(join(storeDirectory, item.package.url)) : await boundedFetch(sourceURL(new URL(item.package.url, source.url).href), MAX_PACKAGE, fetcher);
    assert(bytes.length === item.package.size && checksum(bytes) === item.package.sha256, 'APP_PACKAGE_INTEGRITY', '应用包大小或 SHA256 校验失败。');
    const decoded = decodePackage(bytes); assert(sameManifest(decoded.manifest, item.manifest), 'APP_PACKAGE_INTEGRITY', '应用包与安装前展示的声明不一致。');
    const latest=(await index(source)).filter(e=>e.manifest.id===input.appId&&!e.incompatibility).sort((a,b)=>compareVersions(b.manifest.version,a.manifest.version));
    assert(latest.some(e=>e.package.sha256===item.package.sha256)&&latest[0]?.manifest.version===item.manifest.version,'APP_RELEASE_CHANGED','下载期间应用目录已更新，请重新核对最新版本。',409);
    return commitPackage(decoded,item.package.sha256,source,state=>{
      assert(state.sources.some(s => s.id === source.id && (s.enabled || bundled && s.id === 'builtin') && s.url === source.url), 'APP_SOURCE_CHANGED', '安装期间应用源配置已变化，请重试。', 409);
      const existing=state.installed[input.appId];
      assert(!existing || existing.active.source.id===source.id,'APP_SOURCE_CHANGED','安装期间应用来源已变化，请刷新后重试。',409);
    });
  }
  function history(manifest) {
    const parent=join(home,'packages',manifest.id);let names=[];
    try{names=readdirSync(parent);}catch(error){if(error.code!=='ENOENT')throw error;}
    return names.filter(name=>/^[a-f0-9]{64}$/.test(name)).map(name=>JSON.parse(readFileSync(join(parent,name,'release.json'),'utf8')).release);
  }
  function checkVersionHistory(manifest,digest,{latest=false}={}) {
    for(const prior of history(manifest)){
      const a=prior.manifest,b=manifest;
      assert(prior.digest===digest||a.version!==b.version||a.target!==b.target||a.nodeAbi!==b.nodeAbi,'APP_VERSION_REUSED','已安装过的同一版本对应不同内容，请让开发者发布新版本。',409);
      if(latest){let compatible=true;try{assertCompatible(a);}catch{compatible=false;}
        assert(!compatible||compareVersions(b.version,a.version)>=0,'APP_RELEASE_CHANGED','本机已安装过更高版本，请导入最新应用包；故障回退请使用高级管理。',409);
      }
    }
  }
  function importAction(state,manifest,digest) {
    assert(!OFFICIAL_APPLICATIONS.includes(manifest.id),'APP_ID_RESERVED','此应用标识仅供 KSF 随包应用使用，不能手动导入。');
    const local=state.installed[manifest.id];
    assert(!local||local.active.source.id==='local-import','APP_SOURCE_CHANGED',`此应用来自“${local?.active.source.name}”，请从原源更新；改为手动导入需先卸载并核对数据兼容。`,409);
    checkVersionHistory(manifest,digest,{latest:true});
    if(local?.pending){assert(local.pending.digest===digest,'APP_UPDATE_PENDING','此应用已有新版本等待切换，请关闭旧窗口并等待任务完成。',409);return 'pending';}
    assert(!local||compareVersions(manifest.version,local.active.manifest.version)>=0,'APP_RELEASE_CHANGED','不能通过导入安装旧版本，请使用最新应用包。',409);
    return !local?'install':local.active.digest===digest?'installed':'update';
  }
  async function prepareImport(bytes,fileName) {
    assert(!disposed,'APP_HOST_CLOSED','应用宿主已停止。',503);
    assert(typeof fileName==='string'&&fileName.length<=240&&/\.ksfapp$/i.test(fileName)&&!/[\\/\u0000-\u001f]/.test(fileName),'APP_IMPORT_INVALID','请选择 .ksfapp 应用包。');
    assert(Buffer.isBuffer(bytes)&&bytes.length>0,'APP_IMPORT_INVALID','应用包为空。');
    assert(bytes.length<=MAX_PACKAGE,'APP_PACKAGE_TOO_LARGE','应用包不能超过 32 MiB。',413);
    const {manifest}=decodePackage(bytes);assertCompatible(manifest);
    const digest=checksum(bytes),state=await readState(),action=importAction(state,manifest,digest);
    pruneImports();assert(imports.size<8&&[...imports.values()].reduce((size,item)=>size+item.bytes.length,bytes.length)<=64*1024*1024,'APP_IMPORT_LIMIT','待确认的应用包过多，请取消其他导入或稍后重试。',429);
    const importId=randomUUID(),expiresAt=now()+15*60*1000;
    imports.set(importId,{bytes:Buffer.from(bytes),digest,expiresAt,currentDigest:state.installed[manifest.id]?.active.digest??null,currentPending:state.installed[manifest.id]?.pending?.digest??null});
    return {importId,fileName,expiresAt,action,currentVersion:state.installed[manifest.id]?.active.manifest.version??null,manifest,source:{...importSource,enabled:true},package:{size:bytes.length,sha256:digest,url:fileName},incompatibility:null};
  }
  async function discardImport(importId){assert(uuid(importId),'APP_IMPORT_INVALID','导入凭据无效。');imports.delete(importId);}
  async function installImport(input) {
    assert(input.trusted===true,'APP_TRUST_REQUIRED','请先核对应用来源和权限，并确认信任此应用。');
    pruneImports();const item=imports.get(input.importId);assert(item,'APP_IMPORT_EXPIRED','导入预览已过期或服务已重启，请重新选择应用包。',410);
    assert(input.digest===item.digest&&checksum(item.bytes)===item.digest,'APP_IMPORT_CHANGED','导入内容与确认信息不一致，请重新选择应用包。',409);
    const decoded=decodePackage(item.bytes);assertCompatible(decoded.manifest);
    return commitPackage(decoded,item.digest,importSource,state=>{
      const local=state.installed[decoded.manifest.id],action=importAction(state,decoded.manifest,item.digest);
      assert(['installed','pending'].includes(action)||((local?.active.digest??null)===item.currentDigest&&(local?.pending?.digest??null)===item.currentPending),'APP_RELEASE_CHANGED','确认期间本机应用版本已变化，请重新选择应用包核对。',409);
    });
  }
  async function commitPackage(decoded,digest,source,checkState) {
    const appId=decoded.manifest.id,release = { manifest: decoded.manifest, digest, source: { id: source.id, name: source.name, url: source.url }, installedAt: new Date().toISOString() };
    const target = directory(release), staging = join(home, 'staging', randomUUID());
    await mkdir(staging, { recursive: true, mode: 0o700 });
    try {
      for (const [path, file] of decoded.files) { const out = join(staging, path); await mkdir(dirname(out), { recursive: true, mode: 0o700 }); await writeFile(out, file.data, { mode: file.mode }); }
      await writeFile(join(staging, 'release.json'), JSON.stringify({ release, files: Object.fromEntries([...decoded.files].map(([path, file]) => [path, { sha256: file.sha256, mode: file.mode }])) }), { mode: 0o600 });
      return await mutate(async state => {
        checkState(state);
        const existing = state.installed[appId];
        assert(!existing || compareVersions(release.manifest.version,existing.pending?.manifest.version??existing.active.manifest.version)>=0,'APP_RELEASE_CHANGED','已有更新版本正在使用或等待切换。',409);
        // Immutable versions include pending, rollback and retained uninstalled releases.
        checkVersionHistory(release.manifest,release.digest);
        await mkdir(dirname(target), { recursive: true, mode: 0o700 });
        const present=await lstat(target).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
        if(present)await verifyRelease(release);
        else try { await rename(staging, target); } catch (error) { if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error; await verifyRelease(release); }
        const previous = existing ?? { enabled: true, active: release, previous: null, pending: null };
        if (existing?.active.digest !== release.digest && (running(appId).length||[...runtimes.values()].some(runtime=>runtime.appId===appId&&(runtime.jobs.size||runtime.calls.size)))) previous.pending = release;
        else { if (existing && existing.active.digest !== release.digest) {previous.previous = previous.active;for(const runtime of [...runtimes.values()])if(runtime.appId===appId)await stopRuntime(runtime);} previous.active = release; previous.pending = null; }
        state.installed[appId] = previous;
        await settlePending(state,appId);
        return { pending: !!previous.pending, release };
      });
    } finally { await rm(staging, { recursive: true, force: true }); }
  }
  async function ensureDefaults(){
    if(bootstrap)return bootstrap;
    bootstrap=(async()=>{
      const state=await readState();
      const missing=OFFICIAL_APPLICATIONS.filter(id=>!state.defaults?.includes(id));
      if(!missing.length)return;
      const source=state.sources.find(item=>item.id==='builtin');
      const entries=await index(source);
      // Validate all candidates first. Test stores without bundled defaults are supported.
      const selected=missing.map(id=>entries.filter(item=>item.manifest.id===id&&!item.incompatibility).sort((a,b)=>compareVersions(b.manifest.version,a.manifest.version))[0]).filter(Boolean);
      for(const entry of selected){const bytes=await readFile(join(storeDirectory,entry.package.url));assert(bytes.length===entry.package.size&&checksum(bytes)===entry.package.sha256,'APP_PACKAGE_INTEGRITY','随包应用完整性校验失败。');decodePackage(bytes);}
      for(const entry of selected){
        if(!(await readState()).installed[entry.manifest.id])await install({appId:entry.manifest.id,sourceId:'builtin',version:entry.manifest.version,digest:entry.package.sha256,trusted:true},{bundled:true});
        await mutate(next=>{next.defaults=[...new Set([...(next.defaults??[]),entry.manifest.id])];});
      }
    })().catch(error=>{bootstrap=undefined;throw error;});
    return bootstrap;
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
  const serializeError=error=>({code:error.code??'APP_CALL_FAILED',message:error.message,status:error.status,data:error.data});
  async function runtimeService(runtime,message){
    const reply=(value,error)=>{if(runtime.child?.connected)runtime.child.send({type:'service-result',id:message.id,value,error});};
    try{
      let value;
      if(message.service==='runtime'){
        const [argument]=message.params??[];
        if(message.method==='retain'){value=randomUUID();runtime.jobs.add(value);}
        else if(message.method==='release'){runtime.jobs.delete(argument);}
        else if(message.method==='lock'){
          assert(typeof argument==='string'&&argument.length<=4096,'APP_CALL_INVALID','资源锁标识无效。');
          value=await new Promise((resolve,reject)=>{void locks.run(argument,()=>new Promise(done=>{const token=randomUUID();runtime.locks.set(token,done);resolve(token);})).catch(reject);});
          if(runtime.closed){runtime.locks.get(value)?.();runtime.locks.delete(value);throw problem('APP_PROCESS_EXITED','应用已停止。');}
        }else if(message.method==='unlock'){runtime.locks.get(argument)?.();runtime.locks.delete(argument);}
        else throw problem('APP_SERVICE_UNKNOWN','未知运行时服务。');
      }else if(message.service==='background'){
        assert(runtime.release.manifest.sdkVersion===3&&runtime.release.manifest.permissions.includes('background'),'APP_PERMISSION_REQUIRED','应用没有声明持久后台能力。',403);
        const [argument]=message.params??[];value=await backgroundLocks.run(runtime.appId,async()=>{
          const path=join(backgroundPath,runtime.appId+'.json'),record=await readJSON(path,{schemaVersion:1,holds:{}});
          if(message.method==='list')return record.holds;
          assert(['retain','release'].includes(message.method),'APP_SERVICE_UNKNOWN','未知后台操作。');
          const key=message.method==='retain'?argument?.key:argument;assert(typeof key==='string'&&key.length>0&&key.length<=128&&!/[\u0000-\u001f]/.test(key),'APP_BACKGROUND_INVALID','持久运行 key 无效。');
          if(message.method==='retain'){assert(typeof argument.reason==='string'&&argument.reason.length<=200,'APP_BACKGROUND_INVALID','运行原因无效。');Object.defineProperty(record.holds,key,{value:{reason:argument.reason},enumerable:true,writable:true,configurable:true});}else delete record.holds[key];
          await safeDirectory(root,backgroundPath);await atomicJSON(path,record);runtime.persistent=Object.keys(record.holds).length;return {key,retained:message.method==='retain'};
        });
      }else{
        const service=services[message.service], action=service?.[message.method];
        assert(typeof action==='function'&&Object.hasOwn(service,message.method),'APP_SERVICE_UNKNOWN','应用请求了未知公共服务。');
        if(message.service==='terminal'){assert(['create','list','read','write','resize','close'].includes(message.method)&&runtime.release.manifest.permissions.includes('shell'),'APP_PERMISSION_REQUIRED','此应用没有声明 shell 权限。',403);assert(runtime.clients.has(message.caller?.instanceId)&&!instances.get(message.caller.instanceId)?.closed,'APP_PROCESS_EXITED','终端窗口租约已失效。',410);}
        if(message.service==='storage')assert(['read','write'].includes(message.method),'APP_SERVICE_UNKNOWN','未知存储方法。');
        if(message.service==='projects')assert(runtime.release.manifest.permissions.includes('filesystem'),'APP_PERMISSION_REQUIRED','此应用没有声明 filesystem 权限。',403);
        if(message.service==='git')assert(runtime.release.manifest.permissions.includes('shell')&&runtime.release.manifest.permissions.includes('filesystem'),'APP_PERMISSION_REQUIRED','此应用没有声明 Git 所需权限。',403);
        if(message.service==='codex-conversations')assert(runtime.release.manifest.sdkVersion>=2&&runtime.release.manifest.permissions.includes('codex-conversations'),'APP_PERMISSION_REQUIRED','此应用没有声明 codex-conversations 权限。',403);
        if(['messages','peers'].includes(message.service))assert(runtime.release.manifest.sdkVersion===3&&runtime.release.manifest.permissions.includes(message.service==='peers'||['send','registerFile','status','reconcile','cancel'].includes(message.method)?'messages.send':'messages.receive'),'APP_PERMISSION_REQUIRED','此应用没有声明所需通信权限。',403);
        value=['ai','codex-conversations','messages','peers','terminal','storage'].includes(message.service)
          ? await action(Object.freeze({appId:runtime.appId,version:runtime.release.manifest.version,releaseDigest:runtime.release.digest,runtimeId:runtime.id,instanceId:message.caller?.instanceId}),...(message.params??[]))
          : await action(...(message.params??[]));
      }
      reply(value);if(!disposed&&['runtime','background'].includes(message.service)&&message.method==='release'){void idleRuntime(runtime);void mutate(state=>settlePending(state,runtime.appId)).catch(()=>{});}
    }catch(error){reply(undefined,serializeError(error));}
  }
  async function startRuntime(appId,release,key){
    if(release.manifest.background===true||release.manifest.sdkVersion===3)assert(!running(appId).some(item=>item.foreign),'APP_OTHER_HOST_RUNNING','此后台应用已在另一个工作台进程中运行。',409);
    const runtime={id:randomUUID(),appId,release,background:release.manifest.background===true,clients:new Set(),jobs:new Set(),locks:new Map(),calls:new Map(),next:0,closed:false};runtimes.set(key,runtime);runtime.key=key;runtime.persistent=await holdCount(appId);runtime.startedAt=Date.now();
    const dataDirectory=join(home,'data',appId);await mkdir(dataDirectory,{recursive:true,mode:0o700});
    const env=release.manifest.sdkVersion>=2&&release.manifest.permissions.includes('environment')?{...process.env}:Object.fromEntries(Object.entries(process.env).filter(([key])=>['PATH','HOME','USER','LOGNAME','SHELL','LANG','LC_ALL','LC_CTYPE','TZ','TMPDIR','TMP','TEMP','SYSTEMROOT','COMSPEC','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA'].includes(key.toUpperCase())));
    const child=fork(hostPath,[],{execArgv:[],env,stdio:['ignore','pipe','pipe','ipc'],cwd:directory(release)});runtime.child=child;
    await mkdir(runtimeHome,{recursive:true,mode:0o700});
    await writeFile(join(runtimeHome,`${runtime.id}.json`),JSON.stringify({id:runtime.id,appId,digest:release.digest,ownerPid:process.pid,childPid:child.pid,createdAt:new Date().toISOString(),kind:'runtime'}),{mode:0o600});
    const log=data=>logs.set(appId,((logs.get(appId)??'')+String(data)).slice(-16000));child.stdout.on('data',log);child.stderr.on('data',log);
    let resolveReady,rejectReady;const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
    const timer=setTimeout(()=>rejectReady(problem('APP_START_TIMEOUT','应用后端启动超时。',504)),10000);
    child.on('message',message=>{
      if(message.type==='ready')resolveReady();
      if(message.type==='failed')rejectReady(problem('APP_START_FAILED',message.message,502));
      if(message.type==='service')void runtimeService(runtime,message);
      if(message.type==='result'){const pending=runtime.calls.get(message.id);if(pending){clearTimeout(pending.timer);runtime.calls.delete(message.id);message.error?pending.reject(Object.assign(new Error(message.error.message),message.error)):pending.resolve(message.value);void idleRuntime(runtime).then(async()=>{if(disposed)return;const state=await readState();if(!disposed&&state.installed[runtime.appId]?.pending)await mutate(next=>settlePending(next,runtime.appId));}).catch(()=>{});}}
    });
    child.on('error',error=>{runtime.error=error.message;rejectReady(problem('APP_START_FAILED',error.message,502));});
    child.on('exit',()=>{
      void terminal.release({runtimeId:runtime.id}).catch(()=>{});
      const intentional=!!runtime.stopping;runtime.closed=true;runtime.error??='应用后端已退出，请重新启动。';try{unlinkSync(join(runtimeHome,`${runtime.id}.json`));}catch{}
      for(const id of runtime.clients){const item=instances.get(id);if(item){item.closed=true;item.error=runtime.error;}}
      for(const pending of runtime.calls.values()){clearTimeout(pending.timer);pending.reject(problem('APP_PROCESS_EXITED',runtime.error,502));}runtime.calls.clear();
      for(const done of runtime.locks.values())done();runtime.locks.clear();runtime.jobs.clear();if(runtimes.get(key)===runtime)runtimes.delete(key);rejectReady(problem('APP_PROCESS_EXITED',runtime.error,502));
      if(!disposed&&!intentional&&(runtime.persistent||runtime.background)){const count=Date.now()-runtime.startedAt>60000?1:(restartCounts.get(appId)??0)+1;restartCounts.set(appId,count);if(count<=5){clearTimeout(backgroundReconcile);backgroundReconcile=setTimeout(()=>{void startBackground().catch(()=>{});},Math.min(60000,1000*2**count));backgroundReconcile.unref();}else backgroundErrors.push({appId,code:'APP_BACKGROUND_PARKED',message:'应用连续异常退出，自动恢复已停放，请检查后重试。'});}
    });
    child.send({type:'init',manifest:release.manifest,directory:directory(release),dataDirectory,workspace:root,resumePersistent:runtime.persistent>0});
    try{await ready;}catch(error){await stopRuntime(runtime);throw error;}finally{clearTimeout(timer);}
    return runtime;
  }
  async function stopRuntime(runtime){
    if(runtime.stopping)return runtime.stopping;
    runtime.stopping=(async()=>{
      runtime.closed=true;await terminal.release({runtimeId:runtime.id});
      if(runtime.child&&runtime.child.exitCode===null&&runtime.child.signalCode===null)await new Promise(resolve=>{
        const timer=setTimeout(()=>runtime.child.kill('SIGKILL'),1500);runtime.child.once('exit',()=>{clearTimeout(timer);resolve();});
        if(runtime.child.connected)runtime.child.send({type:'close'},()=>{});else runtime.child.kill('SIGTERM');
      });
      if(runtimes.get(runtime.key)===runtime)runtimes.delete(runtime.key);await rm(join(runtimeHome,`${runtime.id}.json`),{force:true});
    })();return runtime.stopping;
  }
  async function idleRuntime(runtime){if(!runtime.background&&!runtime.persistent&&!runtime.clients.size&&!runtime.jobs.size&&!runtime.calls.size&&!runtime.closed)await stopRuntime(runtime);}
  async function startBackground(){try{return await startBackgroundInternal();}catch(error){backgroundErrors=[{code:error.code??'APP_START_FAILED',message:'后台协调失败，请检查应用诊断并重试。'}];throw error;}}
  async function startBackgroundInternal(){
    assert(!disposed,'APP_HOST_CLOSED','应用宿主已停止。',503);
    // Boot only already-installed background applications. Merely opening the
    // workbench must not install defaults or create files in a fresh root.
    const installed=await readState(),holds=await backgroundHolds();
    const eligibleApp=(id,app)=>app.enabled&&(app.active.manifest.background===true||Object.keys(holds.applications[id]??{}).length>0);
    const foreign=Object.entries(installed.installed).filter(([id,app])=>eligibleApp(id,app)&&running(id).some(item=>item.foreign));
    const eligible=Object.entries(installed.installed).filter(([id,app])=>eligibleApp(id,app));if(foreign.length&&foreign.length===eligible.length)return {errors:backgroundErrors=foreign.map(([appId])=>({appId,code:'APP_OTHER_HOST_RUNNING',message:'此后台应用已在另一个工作台进程中运行。'}))};
    if(!eligible.length)return {errors:backgroundErrors=[]};
    if(disposed)return {errors:[]};
    return withStateLock(async()=>{
      if(disposed)return {errors:[]};const state=await readState(),errors=[];
      for(const [appId,app] of Object.entries(state.installed))if(eligibleApp(appId,app)){
        if(foreign.some(([id])=>id===appId)){errors.push({appId,code:'APP_OTHER_HOST_RUNNING',message:'此后台应用已在另一个工作台进程中运行。'});continue;}const key=`${appId}@${app.active.digest}`;if(runtimes.get(key)&&!runtimes.get(key).closed)continue;
        try{assertCompatible(app.active.manifest);await verifyRelease(app.active);await startRuntime(appId,app.active,key);}catch(error){errors.push({appId,code:error.code??'APP_START_FAILED',message:error.message});}
      }
      backgroundErrors=errors;return {errors};
    });
  }
  async function launch(appId,digest,surface={}){
    assert(!disposed,'APP_HOST_CLOSED','应用宿主已停止。',503);await ensureDefaults();
    return withStateLock(async()=>{
      const state=await readState(),app=state.installed[appId];
      assert(app?.enabled&&app.active.digest===digest,'APP_RELEASE_CHANGED','应用已更新或停用，请重新打开。',409);assertCompatible(app.active.manifest);await verifyRelease(app.active);
      const kind=surface.kind??'window';assert(['window','card','service'].includes(kind),'APP_CALL_INVALID','应用界面类型无效。');
      if(kind==='card')assert(app.active.manifest.cards?.some(card=>card.id===surface.cardId),'APP_CARD_UNKNOWN','应用没有声明此卡片。');
      if(kind==='window'&&app.active.manifest.schemaVersion===2)assert(app.active.manifest.window,'APP_WINDOW_UNAVAILABLE','此应用只提供桌面卡片。');
      for(const [id,item] of instances)if(item.closed)instances.delete(id);
      assert(instances.size<256,'APP_INSTANCE_LIMIT','应用实例已达到上限，请先关闭部分窗口或卡片。');
      const id=randomUUID(),instance={id,appId,release:app.active,kind,cardId:surface.cardId,pageId:typeof surface.pageId==='string'?surface.pageId.slice(0,100):undefined,surfaceId:typeof surface.surfaceId==='string'?surface.surfaceId.slice(0,512):id,closed:false,lastSeen:Date.now()};
      if(app.active.manifest.backend){
        const key=app.active.manifest.sdkVersion>=2?`${appId}@${digest}`:id;
        let runtime=runtimes.get(key);if(!runtime||runtime.closed)runtime=await startRuntime(appId,app.active,key);
        runtime.clients.add(id);instance.runtime=runtime;
      }
      instances.set(id,instance);return {id,appId,version:app.active.manifest.version,digest};
    });
  }
  async function call(id,method,params,{maxBytes=1024*1024,messageType='call',waitForCompletion=false}={}){
    assert(uuid(id)&&typeof method==='string'&&/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test(method),'APP_CALL_INVALID','应用调用参数无效。');
    const instance=instances.get(id),runtime=instance?.runtime;
    assert(instance&&!instance.closed&&runtime&&!runtime.closed&&runtime.child?.connected,'APP_PROCESS_EXITED','应用后端已停止，请重新启动。',410);
    assert(Buffer.byteLength(JSON.stringify(params??null))<=maxBytes,'APP_CALL_INVALID','单次应用调用参数超过大小上限。',413);
    instance.lastSeen=Date.now();assert(runtime.calls.size<128,'APP_BUSY','应用请求过多，请稍后重试。',429);
    const next=++runtime.next;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{if(waitForCompletion){backgroundErrors.push({appId:runtime.appId,code:'APP_MESSAGE_TIMEOUT',message:'消息处理尚未返回，保留在途租约，避免并发重投。'});return;}reject(problem('APP_CALL_TIMEOUT','应用请求超时，后端执行结果尚待核对，请勿重复写操作。',504,{outcomeUnknown:true}));},callTimeoutMs);
      runtime.calls.set(next,{resolve,reject,timer});runtime.child.send({type:messageType,id:next,method,params,caller:{source:messageType==='cli'?'cli':messageType==='message'?'message':'surface',appId:runtime.appId,version:runtime.release.manifest.version,packageDigest:runtime.release.digest,instanceId:id,surfaceId:instance.surfaceId,kind:instance.kind,cardId:instance.cardId}},error=>{if(error){clearTimeout(timer);runtime.calls.delete(next);reject(problem('APP_PROCESS_EXITED','应用进程已退出。',410));}});
    });
  }
  async function stopInstance(id){
    const instance=instances.get(id);if(!instance)return;
    instance.closed=true;instances.delete(id);if(instance.runtime)await terminal.release({runtimeId:instance.runtime.id,instanceId:id});if(instance.runtime){instance.runtime.clients.delete(id);await idleRuntime(instance.runtime);}
  }
  async function release(id){const appId=instances.get(id)?.appId;await stopInstance(id);if(appId&&!disposed)await mutate(state=>settlePending(state,appId));}
  const reaper=setInterval(()=>{pruneImports();for(const instance of instances.values())if(Date.now()-instance.lastSeen>90000)void release(instance.id).catch(()=>{});},15000);reaper.unref();
  async function heartbeat(ids){for(const id of ids??[]){const item=instances.get(id);if(item)item.lastSeen=Date.now();}return {};}
  async function invoke(appId,method,params){
    await ensureDefaults();const app=(await readState()).installed[appId];assert(app?.enabled,'APP_NOT_INSTALLED','所需应用尚未安装或已停用。',404);
    const instance=await launch(appId,app.active.digest,{kind:'service'});try{return await call(instance.id,method,params,{maxBytes:30*1024*1024});}finally{await release(instance.id);}
  }
  async function notify(appId,method,params){
    const client=[...instances.values()].find(item=>item.appId===appId&&!item.closed&&item.runtime&&!item.runtime.closed);
    if(client)return call(client.id,method,params,{maxBytes:30*1024*1024});
  }
  async function listApplications(){const state=await readState();return Object.entries(state.installed).map(([id,app])=>({id,name:app.active.manifest.name,description:app.active.manifest.description,version:app.active.manifest.version,sdkVersion:app.active.manifest.sdkVersion,enabled:app.enabled,hasCLI:!!app.active.manifest.cli}));}
  async function cliDocs(appId,{path,expectedPackageDigest}={}){
    const app=(await readState()).installed[appId],release=app?.active;assert(app?.enabled&&release.manifest.cli,'APP_CLI_UNAVAILABLE','应用未安装、停用或未提供 CLI。',404);assert(!expectedPackageDigest||expectedPackageDigest===release.digest,'APP_RELEASE_CHANGED','应用版本已变化，请重新读取文档。',409);
    const target=path??release.manifest.cli.documentation;assert(validPath(target)&&/^(docs\/.*\.(md|txt|json)|cli\/schemas\/.*\.json)$/.test(target),'APP_CLI_DOCUMENT_INVALID','CLI 文档引用无效。');
    const info=await verifyRelease(release);assert(info.files[target],'APP_CLI_DOCUMENT_INVALID','文档不在当前应用包中。',404);const bytes=await readFile(join(directory(release),target));assert(bytes.length<=256*1024,'APP_CLI_DOCUMENT_TOO_LARGE','单份 CLI 文档超过 256 KiB。',413);
    return {appId,version:release.manifest.version,packageDigest:release.digest,path:target,text:new TextDecoder('utf-8',{fatal:true}).decode(bytes),commands:release.manifest.cli.commands};
  }
  async function cliExec(appId,commandId,input){
    const app=(await readState()).installed[appId];assert(app?.enabled&&app.active.manifest.cli,'APP_CLI_UNAVAILABLE','应用未安装、停用或未提供 CLI。',404);assert(input?.expectedPackageDigest===app.active.digest,'APP_RELEASE_CHANGED','CLI 文档版本与应用不一致，请重新读取。',409);assert(app.active.manifest.cli.commands.some(command=>command.id===commandId),'APP_CLI_COMMAND_UNKNOWN','应用未声明此 CLI 命令。',404);
    const instance=await launch(appId,input.expectedPackageDigest,{kind:'service'});try{const {expectedPackageDigest,...params}=input;return await call(instance.id,commandId,params,{messageType:'cli'});}finally{await release(instance.id);}
  }
  async function communicationPermission(appId,permission){const app=(await readState()).installed[appId];assert(app?.enabled&&app.active.manifest.sdkVersion===3&&app.active.manifest.permissions.includes(permission),'APP_PERMISSION_REQUIRED','应用没有声明所需通信能力。',403);}
  async function messageRoute(appId,channel){const app=(await readState()).installed[appId];return app&&{enabled:app.enabled&&app.active.manifest.sdkVersion===3&&app.active.manifest.activation?.messages?.channels.includes(channel),running:[...runtimes.values()].some(runtime=>runtime.appId===appId&&!runtime.closed),digest:app.active.digest};}
  async function messageRoutes(){const state=await readState();return Object.entries(state.installed).flatMap(([appId,app])=>(app.active.manifest.activation?.messages?.channels??[]).map(channel=>({appId,name:app.active.manifest.name,channel,enabled:app.enabled})));}
  async function deliverMessage(appId,event){
    const route=await messageRoute(appId,event.channel);assert(route?.enabled,'APP_MESSAGE_UNAVAILABLE','应用消息通道不可用。',403);
    const instance=await launch(appId,route.digest,{kind:'service'});try{return await call(instance.id,'onMessage',event,{messageType:'message',waitForCompletion:true});}finally{await release(instance.id);}
  }
  async function changeApp(id,action,force=false){
    return mutate(async state=>{
      const app=state.installed[id];assert(app,'APP_NOT_INSTALLED','应用尚未安装。',404);
      assert(['uninstall','rollback','enable','disable'].includes(action),'APP_ACTION_INVALID','未知应用管理操作。');
      const active=running(id);assert(!active.some(item=>item.foreign),'APP_OTHER_HOST_RUNNING','此应用仍在另一个工作台服务中运行，请先在那里关闭。',409);
      assert(![...runtimes.values()].some(runtime=>runtime.appId===id&&(runtime.jobs.size||runtime.calls.size)),'APP_BUSY','应用还有未完成的操作，请等待完成后重试。',409);
      if(active.some(item=>item.kind!=='card'))assert(force,'APP_RUNNING','请先关闭此应用的所有窗口。',409);
      for(const item of active)await stopInstance(item.id);
      for(const runtime of [...runtimes.values()])if(runtime.appId===id)await stopRuntime(runtime);
      if(action==='uninstall')delete state.installed[id];
      else if(action==='rollback'){assert(app.previous&&!app.pending,'APP_ROLLBACK_UNAVAILABLE','没有可回退版本，或已有升级等待切换。');await verifyRelease(app.previous);const previous=app.previous;app.previous=app.active;app.active=previous;}
      else app.enabled=action==='enable';
    });
  }
  async function storeAsset(name) { assert(name === 'index.json' || /^[a-zA-Z0-9_.-]+\.ksfapp$/.test(name) || storeMediaPath(name), 'APP_ASSET_NOT_FOUND', '应用源资源不存在。', 404); return readFile(join(storeDirectory, name)); }
  const mediaCache=new Map(),mediaPending=new Map();
  async function media({sourceId,appId,version,digest}){
    assert(/^[a-f0-9]{64}$/.test(digest??''),'APP_ASSET_NOT_FOUND','商店图片不存在。',404);
    const state=await readState(),source=state.sources.find(s=>s.id===sourceId&&s.enabled);assert(source,'APP_ASSET_NOT_FOUND','图片所属应用源不可用。',404);
    const key=source.id+':'+source.url+':'+appId+':'+version+':'+digest;
    if(mediaCache.has(key)){const value=mediaCache.get(key);mediaCache.delete(key);mediaCache.set(key,value);return value;}
    if(mediaPending.has(key))return mediaPending.get(key);
    const pending=(async()=>{
      const entries=await index(source),entry=entries.find(e=>e.manifest.id===appId&&e.manifest.version===version&&[e.listing?.icon,...(e.listing?.screenshots??[])].some(i=>i?.sha256===digest));
      const image=[entry?.listing?.icon,...(entry?.listing?.screenshots??[])].find(i=>i?.sha256===digest);assert(image&&storeMediaPath(image.url),'APP_ASSET_NOT_FOUND','图片未在应用源中声明。',404);
      const bytes=source.id==='builtin'?await readFile(join(storeDirectory,image.url)):await boundedFetch(sourceURL(new URL(image.url,source.url).href),MAX_STORE_IMAGE,fetcher);
      assert(bytes.length===image.size&&bytes.length<=MAX_STORE_IMAGE&&checksum(bytes)===digest,'APP_PACKAGE_INTEGRITY','商店图片摘要或容量校验失败。',422);
      const value={bytes,type:storeImageType(bytes)};mediaCache.set(key,value);while([...mediaCache.values()].reduce((n,v)=>n+v.bytes.length,0)>32*1024*1024)mediaCache.delete(mediaCache.keys().next().value);return value;
    })().finally(()=>mediaPending.delete(key));mediaPending.set(key,pending);return pending;
  }
  async function close() { disposed = true; imports.clear();clearInterval(reaper);clearTimeout(backgroundReconcile); await coordinator.run('state',async()=>{}); await Promise.all([...instances.keys()].map(stopInstance)); await Promise.all([...runtimes.values()].map(stopRuntime));await terminal.dispose(); }
  function caller(id) {
    const instance=instances.get(id);assert(instance&&!instance.closed,'APP_PROCESS_EXITED','应用租约已失效。',410);
    return Object.freeze({appId:instance.appId,version:instance.release.manifest.version,releaseDigest:instance.release.digest});
  }
  return { snapshot, catalog, install, prepareImport,installImport,discardImport,invoke, notify, ensureDefaults, startBackground,getBackgroundErrors:()=>structuredClone(backgroundErrors),saveSource, removeSource, asset, launch, call, release, heartbeat, changeApp, storeAsset, media,caller,listApplications,cliDocs,cliExec,messageRoute,messageRoutes,deliverMessage,backgroundHolds,communicationPermission,close };
}
