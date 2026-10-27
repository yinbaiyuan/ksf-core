import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { assert } from '../services/workbench-common.js';

export const SDK_VERSION = 1;
export const MAX_PACKAGE = 32 * 1024 * 1024;
export const MAX_EXPANDED = 96 * 1024 * 1024;
export const checksum = bytes => createHash('sha256').update(bytes).digest('hex');
export function sameManifest(a, b) { const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value; return JSON.stringify(stable(a)) === JSON.stringify(stable(b)); }
export const validPath = value => typeof value === 'string' && value.length < 512 && !/[\\\x00-\x1f:]/.test(value) && value.split('/').every(p => p && p !== '.' && p !== '..' && p !== '.git');
export const validId = value => typeof value === 'string' && /^[a-z][a-z0-9.-]{1,79}$/.test(value) && !value.includes('..') && !['constructor', 'prototype', 'conversations', 'markdown', 'git', 'app-store'].includes(value);
export const validVersion = value => typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);
export const compareVersions = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };
export function validateManifest(value) {
  assert(value && typeof value === 'object' && value.schemaVersion === 1 && validId(value.id) && validVersion(value.version), 'APP_MANIFEST_INVALID', '应用标识、版本或清单格式无效。');
  assert(typeof value.name === 'string' && value.name.length > 0 && value.name.length <= 80 && typeof value.description === 'string' && value.description.length <= 2000, 'APP_MANIFEST_INVALID', '应用名称或说明无效。');
  assert(Number.isSafeInteger(value.sdkVersion) && value.sdkVersion >= 1, 'APP_MANIFEST_INVALID', '应用 SDK 版本声明无效。');
  assert(validPath(value.frontend?.entry) && /^frontend\/.+\.m?js$/.test(value.frontend.entry), 'APP_MANIFEST_INVALID', '前端入口必须是 frontend/ 内的 ESM 文件。');
  assert(Array.isArray(value.frontend.styles ?? []) && (value.frontend.styles ?? []).every(p => validPath(p) && /^frontend\/.+\.css$/.test(p)), 'APP_MANIFEST_INVALID', '应用样式入口无效。');
  assert(!value.backend || value.backend.runtime === 'node' && validPath(value.backend.entry) && /^backend\/.+\.m?js$/.test(value.backend.entry), 'APP_MANIFEST_INVALID', '后端入口必须是 backend/ 内的 Node.js 模块。');
  assert(Array.isArray(value.permissions) && value.permissions.length <= 32 && value.permissions.every(p => typeof p === 'string' && /^[a-z][a-z0-9.:-]{0,79}$/.test(p)), 'APP_MANIFEST_INVALID', '应用权限声明无效。');
  assert(!value.target || typeof value.target === 'string' && /^[a-z0-9-]+$/.test(value.target), 'APP_MANIFEST_INVALID', '应用平台标识无效。');
  assert(!value.nodeAbi || typeof value.nodeAbi === 'string' && /^\d+$/.test(value.nodeAbi), 'APP_MANIFEST_INVALID', '应用 Node ABI 声明无效。');
  return value;
}
export function assertCompatible(manifest) {
  validateManifest(manifest);
  assert(manifest.sdkVersion === SDK_VERSION, 'APP_SDK_INCOMPATIBLE', '此应用需要不同版本的 KSF 应用 SDK。');
  assert(!manifest.target || manifest.target === `${process.platform}-${process.arch}`, 'APP_PLATFORM_UNSUPPORTED', `此应用包不支持当前平台 ${process.platform}-${process.arch}。`);
  assert(!manifest.nodeAbi || manifest.nodeAbi === process.versions.modules, 'APP_RUNTIME_INCOMPATIBLE', '此应用的原生模块与当前 Node.js 不兼容，请选择匹配的应用包。');
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
    assert(validPath(path) && /^(frontend|backend)\//.test(path) && !paths.has(path.toLowerCase()), 'APP_PACKAGE_INVALID', '应用包包含越界或重复路径。');
    assert(file && typeof file.content === 'string' && file.content.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(file.content) && /^[a-f0-9]{64}$/.test(file.sha256) && [0o644, 0o755].includes(file.mode), 'APP_PACKAGE_INVALID', '应用文件内容或模式无效。');
    const data = Buffer.from(file.content, 'base64'); total += data.length;
    assert(total <= MAX_EXPANDED && checksum(data) === file.sha256, 'APP_PACKAGE_INVALID', '应用文件完整性校验失败。');
    paths.add(path.toLowerCase()); files.set(path, { data, mode: file.mode, sha256: file.sha256 });
  }
  for (const path of [value.manifest.frontend.entry, ...(value.manifest.frontend.styles ?? []), ...(value.manifest.backend ? [value.manifest.backend.entry] : [])]) assert(files.has(path), 'APP_PACKAGE_INVALID', `应用包缺少入口：${path}`);
  return { manifest: value.manifest, files };
}
