// Generated from applications/sdk/server/protocol.js. Run sdk/scripts/sync-protocol.mjs.
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { assert } from '../services/workbench-common.js';

export const SDK_VERSION = 1;
export const SUPPORTED_SDK_VERSIONS = [1];
export const DEFAULT_APPLICATIONS = ['com.ksf.conversations', 'com.ksf.markdown', 'com.ksf.git', 'com.ksf.projects', 'com.ksf.knowledge', 'com.ksf.abilities', 'com.ksf.documentation','com.ksf.activity-monitor','com.ksf.cooperation-center'];
export const OFFICIAL_APPLICATIONS = [...DEFAULT_APPLICATIONS,'com.ksf.terminal'];
export const isOfficialApplicationId = id => typeof id==='string'&&id.startsWith('com.ksf.');
export const windowEntry = manifest => manifest.window;
export const entryPoints = manifest => [windowEntry(manifest), ...(manifest.cards ?? [])].filter(Boolean);
export const MAX_PACKAGE = 32 * 1024 * 1024;
export const MAX_EXPANDED = 96 * 1024 * 1024;
export const MAX_CLI_DOCUMENT = 256 * 1024;
export function readCLIDocument(bytes, {main = false} = {}) {
  assert(bytes.length <= MAX_CLI_DOCUMENT, 'APP_CLI_DOCUMENT_TOO_LARGE', '单份 CLI 文档超过 256 KiB。', 413);
  let text;
  try { text = new TextDecoder('utf-8', {fatal:true}).decode(bytes); }
  catch { assert(false, 'APP_CLI_DOCUMENT_INVALID', 'CLI 文档必须使用有效的 UTF-8 编码。'); }
  assert(!main || text.trim().length > 0, 'APP_CLI_DOCUMENT_INVALID', 'CLI 主文档不能为空。');
  return text;
}
export const checksum = bytes => createHash('sha256').update(bytes).digest('hex');
export function sameManifest(a, b) { const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value; return JSON.stringify(stable(a)) === JSON.stringify(stable(b)); }
export const validPath = value => typeof value === 'string' && value.length < 512 && !/[\\\x00-\x1f:]/.test(value) && value.split('/').every(p => p && p !== '.' && p !== '..' && p !== '.git');
export const validId = value => typeof value === 'string' && /^[a-z][a-z0-9.-]{1,79}$/.test(value) && !value.includes('..') && !['constructor', 'prototype', 'app-store'].includes(value);
// Application identities and local keys (cards, commands, etc.) are distinct.
export const validApplicationId = value => typeof value === 'string' && value.length <= 80 && /^com\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) && value !== 'com.ksf.app-store';
export const validVersion = value => typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) && value.split('.').every(part => Number.isSafeInteger(Number(part)));
export const compareVersions = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };
export const MAX_STORE_IMAGE = 8 * 1024 * 1024;
export const storeMediaPath = value => typeof value === 'string' && /^media\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(value);
export function storeImageType(bytes) {
  if(bytes.length>=8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes.length>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255)return 'image/jpeg';
  if(bytes.length>=12 && bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
  assert(false,'APP_LISTING_INVALID','商店图片只支持 PNG、JPEG 或 WebP。',400);
}
export function validateStoreListing(value) {
  if(value===undefined)return;
  assert(value && typeof value==='object' && !Array.isArray(value),'APP_LISTING_INVALID','商店展示资料必须是对象。',400);
  for(const [key,max] of [['subtitle',120],['description',12000],['releaseNotes',8000]])assert(value[key]===undefined || typeof value[key]==='string' && value[key].length<=max,'APP_LISTING_INVALID',`商店字段 ${key} 无效或过长。`,400);
  assert(value.screenshots===undefined || Array.isArray(value.screenshots) && value.screenshots.length<=8,'APP_LISTING_INVALID','应用最多提供 8 张商店截图。',400);
  for(const image of [value.icon,...(value.screenshots??[])].filter(x=>x!==undefined))assert(image && storeMediaPath(image.url) && /^[a-f0-9]{64}$/.test(image.sha256) && image.url.split('/')[1].split('.')[0]===image.sha256 && Number.isSafeInteger(image.size) && image.size>0 && image.size<=MAX_STORE_IMAGE && (image.alt===undefined || typeof image.alt==='string' && image.alt.length<=200),'APP_LISTING_INVALID','商店图片路径、摘要、容量或替代文字无效。',400);
  for(const image of value.screenshots??[])assert(typeof image.alt==='string'&&image.alt.trim().length>0,'APP_LISTING_INVALID','商店截图必须提供替代文字。',400);
  return value;
}
/** Select once for browsing and install checks; installed apps never silently change source. */
export function groupStoreApplications(apps,sources,installed={},errors=[]) {
  const ids=new Set([...apps.map(e=>e.manifest.id),...Object.keys(installed)]),failed=new Set(errors.map(e=>e.sourceId));
  const rank=e=>Number(!!e.manifest.target)*2+Number(!!e.manifest.nodeAbi);
  const order=(a,b)=>compareVersions(b.manifest.version,a.manifest.version) || Number(sources.some(s=>s.id===b.source.id&&s.default))-Number(sources.some(s=>s.id===a.source.id&&s.default)) || sources.findIndex(s=>s.id===a.source.id)-sources.findIndex(s=>s.id===b.source.id) || rank(b)-rank(a);
  return [...ids].map(appId=>{
    const local=installed[appId],all=apps.filter(e=>e.manifest.id===appId),origin=local?.active.source.id,source=sources.find(s=>s.id===origin);
    const scoped=(origin?all.filter(e=>e.source.id===origin):all).sort(order),compatible=scoped.filter(e=>!e.incompatibility),candidate=compatible[0]??null;
    const unavailableReason=origin&&!source?'原安装源已移除，暂时无法检查更新。':origin&&!source.enabled?'原安装源已停用，暂时无法检查更新。':origin&&failed.has(origin)?'原安装源暂时无法读取，请刷新重试。':!scoped.length?'应用源已不再提供此应用。':!candidate?scoped[0].incompatibility:null;
    const display=local&&(!candidate||compareVersions(local.active.manifest.version,candidate.manifest.version)>0)?local.active:candidate??scoped[0]??local?.active;
    return {appId,display:{manifest:display.manifest,source:display.source,...(display.listing?{listing:display.listing}:{})},candidate:unavailableReason?null:candidate,latestPublishedVersion:scoped[0]?.manifest.version??null,unavailableReason};
  }).sort((a,b)=>a.display.manifest.name.localeCompare(b.display.manifest.name));
}
export function validateManifest(value) {
  assert(value && typeof value === 'object' && value.schemaVersion === 1 && validVersion(value.version), 'APP_MANIFEST_INVALID', '应用版本或清单格式无效。');
  assert(validApplicationId(value.id), 'APP_ID_INVALID', '应用 ID 必须是 com.<发布者>.<应用名> 三段式，后两段使用小写字母开头的小写字母、数字或段内连字符，总长不超过 80；com.ksf.app-store 为宿主保留。');
  assert(typeof value.name === 'string' && value.name.length > 0 && value.name.length <= 80 && typeof value.description === 'string' && value.description.length <= 2000, 'APP_MANIFEST_INVALID', '应用名称或说明无效。');
  assert(value.sdkVersion === 1, 'APP_MANIFEST_INVALID', '应用 SDK 版本声明无效。');
  assert(validVersion(value.minCoreVersion), 'APP_MANIFEST_INVALID', '应用必须声明明确的 minCoreVersion。');
  assert(Array.isArray(value.dataStores) && value.dataStores.length <= 64, 'APP_MANIFEST_INVALID', '应用必须声明 dataStores，无受管数据时使用空数组。');
  const stores = new Set();
  for (const store of value.dataStores) {
    assert(store && typeof store === 'object' && !Array.isArray(store) && typeof store.name === 'string' && /^[a-zA-Z0-9_-]+\.json$/.test(store.name) && ['user','runtime'].includes(store.scope), 'APP_MANIFEST_INVALID', '受管数据需要 JSON 文件名和 user/runtime 范围。');
    const key = store.scope + ':' + store.name;
    assert(!stores.has(key) && Number.isSafeInteger(store.schemaVersion) && store.schemaVersion > 0 && Array.isArray(store.migrateFrom) && new Set(store.migrateFrom).size === store.migrateFrom.length && store.migrateFrom.every(v => Number.isSafeInteger(v) && v > 0 && v < store.schemaVersion), 'APP_MANIFEST_INVALID', '受管数据版本、迁移来源或文件声明无效。');
    stores.add(key);
  }
  assert(value.dataStores.length === 0 || value.backend, 'APP_MANIFEST_INVALID', '受管数据需要应用后端。');
  for(const key of ['author','icon'])assert(value[key]===undefined||typeof value[key]==='string'&&value[key].length<=200,'APP_MANIFEST_INVALID','应用显示信息必须是字符串。');
  if (value.schemaVersion === 1) {
    assert(value.window===undefined||value.window&&typeof value.window==='object'&&!Array.isArray(value.window),'APP_MANIFEST_INVALID','window必须为窗口对象。');
    assert((value.cards === undefined || Array.isArray(value.cards)) && (value.cards ?? []).length <= 64, 'APP_MANIFEST_INVALID', '应用卡片声明无效。');
    const ids = new Set();
    for (const card of value.cards ?? []) {
      assert(card && validId(card.id) && !ids.has(card.id) && typeof card.name === 'string' && card.name.length > 0 && card.name.length <= 80 && typeof card.description === 'string' && card.description.length <= 2000, 'APP_MANIFEST_INVALID', '卡片标识、名称或说明无效。'); ids.add(card.id);
      for (const size of [card.defaultSize, card.minSize]) assert(size && ['w', 'h'].every(key => Number.isInteger(size[key]) && size[key] >= 1 && size[key] <= 12), 'APP_MANIFEST_INVALID', '卡片尺寸必须是 1 至 12 的网格数。');
      assert(card.defaultSize.w >= card.minSize.w && card.defaultSize.h >= card.minSize.h, 'APP_MANIFEST_INVALID', '卡片默认尺寸小于最小尺寸。');
    }
  }
  const window = value.window;
  if(window){
    assert(typeof window === 'object' && !Array.isArray(window), 'APP_MANIFEST_INVALID', '窗口声明需要对象。');
    assert(window.multiInstance === undefined || typeof window.multiInstance === 'boolean', 'APP_MANIFEST_INVALID', 'multiInstance 必须是布尔值。');
    for(const key of ['defaultSize','minSize'])if(window[key]!==undefined)assert(window[key] && ['width','height'].every(axis=>Number.isSafeInteger(window[key][axis])&&window[key][axis]>0&&window[key][axis]<=16384),'APP_MANIFEST_INVALID','窗口尺寸必须是 1 至 16384 的整数像素。');
    if(window.defaultSize&&window.minSize)assert(['width','height'].every(axis=>window.defaultSize[axis]>=window.minSize[axis]),'APP_MANIFEST_INVALID','窗口默认尺寸小于最小尺寸。');
  }
  const entries = entryPoints(value);
  assert(entries.length > 0 || value.backend, 'APP_MANIFEST_INVALID', '应用需要界面或后端。');
  assert(!['frontend','background','multiInstance','defaultSize','minSize'].some(key=>key in value), 'APP_MANIFEST_INVALID', '仅支持新 SDK v1 清单结构。');
  for (const entry of entries) {
    assert(validPath(entry.entry) && /^frontend\/.+\.m?js$/.test(entry.entry), 'APP_MANIFEST_INVALID', '前端入口必须是 frontend/ 内的 ESM 文件。');
    assert(Array.isArray(entry.styles ?? []) && (entry.styles ?? []).every(p => validPath(p) && /^frontend\/.+\.css$/.test(p)), 'APP_MANIFEST_INVALID', '应用样式入口无效。');
  }
  assert(value.backend === undefined || value.backend && typeof value.backend==='object' && !Array.isArray(value.backend) && value.backend.runtime === 'node' && ['on-demand','resident'].includes(value.backend.lifecycle) && validPath(value.backend.entry) && /^backend\/.+\.m?js$/.test(value.backend.entry), 'APP_MANIFEST_INVALID', '后端需声明 node runtime、backend/ 内的模块入口及 on-demand/resident lifecycle。');
  assert(Array.isArray(value.permissions) && value.permissions.length <= 32 && value.permissions.every(p => typeof p === 'string' && /^[a-z][a-z0-9.:-]{0,79}$/.test(p)), 'APP_MANIFEST_INVALID', '应用权限声明无效。');
  assert(value.backend?.lifecycle!=='resident'||value.permissions.includes('background'),'APP_MANIFEST_INVALID','常驻后端需要 background 权限。');
  if(value.cli!==undefined){
    const cli=value.cli;assert(value.sdkVersion===1&&value.backend&&cli&&cli.contractVersion===1&&validPath(cli.entry)&&/^cli\/.+\.m?js$/.test(cli.entry)&&validPath(cli.documentation)&&/^docs\/.+\.(md|txt)$/.test(cli.documentation),'APP_MANIFEST_INVALID','应用 CLI 需要 SDK v1 后端、包内 cli/ 入口和 docs/ 文档。');
    assert(Array.isArray(cli.commands)&&cli.commands.length>0&&cli.commands.length<=128,'APP_MANIFEST_INVALID','应用 CLI 命令数量无效。');const commands=new Set();
    for(const command of cli.commands){assert(command&&typeof command.id==='string'&&/^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/.test(command.id)&&!commands.has(command.id),'APP_MANIFEST_INVALID','CLI 命令无效或重复。');commands.add(command.id);}
  }
  if(value.workflows!==undefined)assert(value.workflows?.contractVersion===1&&value.backend&&value.permissions.includes('background'),'APP_MANIFEST_INVALID','工作流提供方需要 SDK v1 后端及 background 权限。');
  if(value.activation!==undefined){const channels=value.activation?.messages?.channels;assert(value.sdkVersion===1&&value.backend&&Array.isArray(channels)&&channels.length>0&&channels.length<=32&&new Set(channels).size===channels.length&&channels.every(channel=>typeof channel==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(channel))&&value.permissions.includes('messages.receive'),'APP_MANIFEST_INVALID','消息激活需要 SDK v1 后端、通道和 messages.receive 声明。');}
  assert(value.target === undefined || typeof value.target === 'string' && /^[a-z0-9-]+$/.test(value.target), 'APP_MANIFEST_INVALID', '应用平台标识无效。');
  assert(value.nodeAbi === undefined || typeof value.nodeAbi === 'string' && /^\d+$/.test(value.nodeAbi), 'APP_MANIFEST_INVALID', '应用 Node ABI 声明无效。');
  return value;
}
export function assertCompatible(manifest, {coreVersion, platform = process.platform, arch = process.arch, nodeAbi = process.versions.modules} = {}) {
  validateManifest(manifest);
  assert(manifest.schemaVersion===1&&manifest.sdkVersion===1, 'APP_SDK_INCOMPATIBLE', '此应用需要不同版本的 KSF 应用 SDK。');
  assert(validVersion(coreVersion), 'APP_HOST_VERSION_REQUIRED', '兼容检查需要实际 Core 版本。');
  assert(compareVersions(coreVersion, manifest.minCoreVersion) >= 0, 'APP_CORE_INCOMPATIBLE', `应用需要 Core ${manifest.minCoreVersion} 或更新版本，当前为 ${coreVersion}。`, 409);
  assert(!manifest.target || manifest.target === `${platform}-${arch}`, 'APP_PLATFORM_UNSUPPORTED', `此应用包不支持当前平台 ${platform}-${arch}。`);
  assert(!manifest.nodeAbi || manifest.nodeAbi === nodeAbi, 'APP_RUNTIME_INCOMPATIBLE', '此应用的原生模块与当前 Node.js 不兼容，请选择匹配的应用包。');
}
export function encodePackage(manifest, files) {
  validateManifest(manifest);
  return gzipSync(Buffer.from(JSON.stringify({ protocol: 'ksf-app-package-v1', manifest, files })), { level: 9 });
}
export function decodePackage(bytes) {
  assert(bytes.length <= MAX_PACKAGE, 'APP_PACKAGE_TOO_LARGE', '应用包超过大小上限。');
  let value;
  try { value = JSON.parse(gunzipSync(bytes, { maxOutputLength: MAX_EXPANDED }).toString('utf8')); }
  catch { assert(false, 'APP_PACKAGE_INVALID', '应用包损坏或解压后超过大小上限。'); }
  assert(value?.protocol === 'ksf-app-package-v1', 'APP_PACKAGE_INVALID', '不支持此应用包格式。');
  validateManifest(value.manifest);
  assert(value.files && typeof value.files === 'object' && !Array.isArray(value.files) && Object.keys(value.files).length > 0 && Object.keys(value.files).length <= 2000, 'APP_PACKAGE_INVALID', '应用文件清单无效。');
  const paths = new Set(), files = new Map(); let total = 0;
  for (const [path, file] of Object.entries(value.files)) {
    assert(validPath(path) && /^(frontend|backend|cli|docs)\//.test(path) && !paths.has(path.toLowerCase()), 'APP_PACKAGE_INVALID', '应用包包含越界或重复路径。');
    assert(file && typeof file.content === 'string' && file.content.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(file.content) && /^[a-f0-9]{64}$/.test(file.sha256) && [0o644, 0o755].includes(file.mode), 'APP_PACKAGE_INVALID', '应用文件内容或模式无效。');
    const data = Buffer.from(file.content, 'base64'); total += data.length;
    assert(total <= MAX_EXPANDED && checksum(data) === file.sha256, 'APP_PACKAGE_INVALID', '应用文件完整性校验失败。');
    paths.add(path.toLowerCase()); files.set(path, { data, mode: file.mode, sha256: file.sha256 });
  }
  for (const path of [...entryPoints(value.manifest).flatMap(entry => [entry.entry, ...(entry.styles ?? [])]), ...(value.manifest.backend ? [value.manifest.backend.entry] : []),...(value.manifest.cli?[value.manifest.cli.entry,value.manifest.cli.documentation]:[])]) assert(files.has(path), 'APP_PACKAGE_INVALID', `应用包缺少入口：${path}`);
  if(value.manifest.cli)readCLIDocument(files.get(value.manifest.cli.documentation).data,{main:true});
  return { manifest: value.manifest, files };
}
