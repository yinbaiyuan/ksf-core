import {recipeKey,HOST_LAUNCHER_ICON_ID} from './keys.js';
import {Worker} from 'node:worker_threads';
import {createHash, randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {readFile, writeFile, mkdir, lstat, rename, rm, open} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {problem} from '../../services/workbench-common.js';

export const PROCESSOR_VERSION = '1.0.1';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const builtinHome = fileURLToPath(new URL('./builtin/', import.meta.url));
const recipes = JSON.parse(readFileSync(join(builtinHome, 'recipes.json'), 'utf8')).recipes;
export const HOST_ICON_APPLICATIONS = ['com.ksf.app-store', 'com.ksf.ability-store', HOST_LAUNCHER_ICON_ID];

/** One bounded worker/queue per host. No decoder runs on the installation thread. */
export function createIconWorker({timeoutMs = 2000, workerURL = new URL('./worker.js', import.meta.url)} = {}) {
  let worker, active, closed = false; const queue = [];
  const finish = async (result, broken = false) => {
    if (!active) return;
    const job = active; active = null; clearTimeout(job.timer);
    if (broken) { const old = worker; worker = undefined; await old?.terminate().catch(() => {}); }
    job.resolve(result); run();
  };
  async function run() {
    if (closed || active || !queue.length) { if (!active) worker?.unref(); return; }
    active = queue.shift();
    const job=active;
    try {
      if (!worker) {
        // A packaged Node snapshot and the test runner may expose process-only
        // flags in execArgv. The image worker needs no CLI/debug/test flags.
        worker = new Worker(workerURL, {execArgv: [], resourceLimits: {maxOldGenerationSizeMb: 128}});
        worker.on('message', result => { void finish(result); });
        worker.on('error', () => { void finish({status: 'fallback', reason: 'worker-failed'}, true); });
        worker.on('exit', code => { if (code && active) void finish({status: 'fallback', reason: 'worker-exited'}, true); });
      }
      worker.ref(); active.timer = setTimeout(() => { void finish({status: 'fallback', reason: 'timeout'}, true); }, Math.min(2000, timeoutMs));
      const input=typeof job.input==='function'?await job.input():job.input;
      if(active!==job)return;
      if(input.result){await finish(input.result);return;}
      worker.postMessage(input);
    } catch { if(active===job)void finish({status: 'fallback', reason: 'worker-failed'}, true); }
  }
  return {process: input => closed ? Promise.resolve({status: 'fallback', reason: 'closed'}) : new Promise(resolve => { queue.push({input, resolve}); run(); }),
    async close() { closed = true; for (const job of queue.splice(0)) job.resolve({status: 'fallback', reason: 'closed'}); if (active) { clearTimeout(active.timer); active.resolve({status: 'fallback', reason: 'closed'}); active = null; } await worker?.terminate(); worker = undefined; }};
}

export function createIconLayers(root, {readImage, workerOptions} = {}) {
  const home = join(root, '.agents/runtime-data/applications/icon-layers'), pending = new Map(), processor = createIconWorker(workerOptions);
  let closed = false;
  async function safeHome() {
    let path = root;
    for (const part of ['.agents','runtime-data','applications','icon-layers']) {
      path = join(path, part); await mkdir(path, {mode: 0o700}).catch(e => { if (e.code !== 'EEXIST') throw e; });
      const stat = await lstat(path); if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Managed icon directory required');
    }
  }
  async function regular(path, limit) { const stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit) throw Error('Managed icon file required'); return readFile(path); }
  function identity(appId, release, local) {
    const image = release?.listing?.icon ?? local?.listing?.icon, key = recipeKey(appId,release?.manifest?.icon);
    const recipe = key && (!image || !release || release.source?.id === 'core') ? recipes[key] : null;
    const sourceDigest = recipe?.sourceDigest ?? image?.sha256 ?? sha(JSON.stringify({appId, icon: release?.manifest?.icon ?? ''}));
    const recipeVersion = recipe?.recipeVersion ?? 'none', cacheKey = sha(JSON.stringify([sourceDigest, PROCESSOR_VERSION, recipeVersion]));
    return {sourceDigest, processorVersion: PROCESSOR_VERSION, recipeVersion, cacheKey, recipe, image};
  }
  const publicValue = (id, record, release) => ({status: record.status, sourceDigest: id.sourceDigest, processorVersion: PROCESSOR_VERSION, recipeVersion: id.recipeVersion,
    ...(release ? {releaseDigest: release.digest} : {}), ...(record.reason ? {reason: record.reason} : {}), ...(record.invalid ? {invalid: true} : {}),
    ...(record.status === 'ready' ? {foreground: {url: `/api/apps/icon-layer?key=${id.cacheKey}&digest=${record.foregroundDigest}`, sha256: record.foregroundDigest}, background: record.background} : {})});
  async function cached(id) {
    try {
      const record = JSON.parse(await regular(join(home, id.cacheKey + '.json'), 8192));
      if (record.schemaVersion !== 1 || record.sourceDigest !== id.sourceDigest || record.processorVersion !== PROCESSOR_VERSION || record.recipeVersion !== id.recipeVersion || !['ready', 'fallback'].includes(record.status)) return null;
      if (record.status === 'ready') {
        if (!hex(record.foregroundDigest) || !validBackground(record.background)) return null;
        const bytes = await regular(join(home, record.foregroundDigest + '.png'), 1024 * 1024);
        if (sha(bytes) !== record.foregroundDigest) return null;
      }
      return record;
    } catch { return null; }
  }
  function validBackground(bg) { return bg && Array.isArray(bg.colors) && bg.colors.length === 2 && bg.colors.every(c => /^#[a-f0-9]{6}$/i.test(c)) && Number.isFinite(bg.angle); }
  async function atomic(name, bytes) {
    const temporary = join(home, `${name}.${randomUUID()}.tmp`);
    try { await writeFile(temporary, bytes, {mode: 0o600, flag: 'wx'}); await rename(temporary, join(home, name)); }
    finally { await rm(temporary, {force: true}); }
  }
  async function prepare(appId, release, local) {
    const id = identity(appId, release, local);
    if (closed) return publicValue(id, {status: 'fallback', reason: 'closed'}, release);
    if (pending.has(id.cacheKey)) return pending.get(id.cacheKey);
    const work = (async () => {
      await safeHome(); const old = await cached(id); if (old) return publicValue(id, old, release);
      const lockPath = join(home, id.cacheKey + '.lock'); let lock;
      try {
        try { lock = await open(lockPath, 'wx', 0o600); await lock.writeFile(JSON.stringify({pid: process.pid})); }
        catch (e) {
          if (e.code !== 'EEXIST') throw e;
          const bytes = await regular(lockPath, 512); let owner;
          try { owner=JSON.parse(bytes); } catch { owner=null; }
          // This advisory lock protects disposable derived files only. A kill
          // between exclusive creation and the PID write leaves an empty lock.
          // Content-addressed PNGs make reclaiming that incomplete lock safe.
          let dead = !Number.isSafeInteger(owner?.pid) || owner.pid <= 0;
          if (!dead) try { process.kill(owner.pid, 0); } catch (probe) { dead = probe.code === 'ESRCH'; }
          if (dead && (await regular(lockPath, 512)).equals(bytes)) { await rm(lockPath); lock = await open(lockPath, 'wx', 0o600); await lock.writeFile(JSON.stringify({pid: process.pid})); }
          else return publicValue(id, {status: 'processing'}, release);
        }
        let result;
        if (id.recipe) {
          const bytes = await readFile(join(builtinHome, id.recipe.file));
          if (sha(bytes) !== id.recipe.foregroundDigest) throw Error('Builtin recipe integrity');
          result = {...await processor.process({bytes, builtin: true}), background: id.recipe.background};
        } else if (id.image) {
          result=await processor.process(async()=>{
            const bytes=await readImage(release,local,id.image);
            if(bytes.length!==id.image.size||sha(bytes)!==id.sourceDigest)return {result:{status:'fallback',reason:'source-integrity',invalid:true}};
            return {bytes};
          });
        } else result = {status: 'fallback', reason: 'no-image'};
        const record = {schemaVersion: 1, status: result.status, sourceDigest: id.sourceDigest, processorVersion: PROCESSOR_VERSION, recipeVersion: id.recipeVersion,
          ...(result.reason ? {reason: result.reason} : {}), ...(result.invalid ? {invalid: true} : {})};
        if (result.status === 'ready' && validBackground(result.background)) {
          const png = Buffer.from(result.png); record.foregroundDigest = sha(png); record.background = result.background;
          // Commit descriptor last. An interrupted PNG write is never exposed.
          await atomic(record.foregroundDigest + '.png', png);
        } else if (result.status === 'ready') { record.status = 'fallback'; record.reason = 'invalid-result'; }
        if (record.reason !== 'closed') await atomic(id.cacheKey + '.json', JSON.stringify(record) + '\n');
        return publicValue(id, record, release);
      } finally { if (lock) { await lock.close(); await rm(lockPath, {force: true}); } }
    })().catch(() => publicValue(id, {status: 'fallback', reason: 'unavailable'}, release)).finally(() => pending.delete(id.cacheKey));
    pending.set(id.cacheKey, work); return work;
  }
  async function snapshot(installed) {
    const result = {};
    for (const [appId, app] of [...Object.entries(installed), ...HOST_ICON_APPLICATIONS.map(id => [id, {}])]) {
      const id = identity(appId, app.active, app.local), old = await cached(id);
      result[appId] = publicValue(id, old ?? {status: 'processing'}, app.active);
      if (!old) void prepare(appId, app.active, app.local);
      if (app.pending) void prepare(appId, app.pending, app.local);
    }
    return result;
  }
  async function asset(key, digest) {
    if (!hex(key) || !hex(digest)) throw problem('APP_ASSET_NOT_FOUND', '图标资源不存在。', 404);
    try {
      await safeHome(); const meta = JSON.parse(await regular(join(home, key + '.json'), 8192));
      if (meta.schemaVersion !== 1 || meta.status !== 'ready' || meta.foregroundDigest !== digest) throw Error();
      const bytes = await regular(join(home, digest + '.png'), 1024 * 1024);
      if (sha(bytes) !== digest || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error();
      return {bytes, type: 'image/png'};
    } catch { throw problem('APP_ASSET_NOT_FOUND', '图标资源不存在，请等待重新准备。', 404); }
  }
  return {prepare, snapshot, asset, async close() { closed = true; await processor.close(); await Promise.allSettled([...pending.values()]); }};
}
