import {readFile, realpath, stat} from 'node:fs/promises';
import {resolve, join, dirname, relative, extname, sep} from 'node:path';
import {createHash} from 'node:crypto';
import {sourcePath} from '../source-path.mjs';
import {init, parse} from 'es-module-lexer';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const fail = (code, message) => Object.assign(new Error(message), {code});
export async function bytes(root, file) {
  const path = sourcePath(root, file);
  if ((await stat(path)).size > 8 * 1024 * 1024) throw fail('COMPONENT_DATA_INVALID', '组件资料超过读取上限。');
  return readFile(path);
}
export async function json(root, file) {return JSON.parse((await bytes(root, file)).toString());}

/** Import/types branches only. A physical private file is never a public binding. */
export function publicEntry(pkg, module, {runtime = false} = {}) {
  if (!module.startsWith('@ksf/sdk/')) return null;
  const key = './' + module.slice('@ksf/sdk/'.length);
  const pick = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(pick).find(Boolean) : value && typeof value === 'object' ? (!runtime ? pick(value.types) : null) ?? pick(value.import) ?? pick(value.default) : null;
  const value = pick(pkg.exports?.[key]);
  return value?.startsWith('./') && !value.includes('*') ? value : null;
}

export function validateData(groups, contracts, proposals) {
  if (!Array.isArray(groups) || !Array.isArray(contracts) || !Array.isArray(proposals)) throw fail('COMPONENT_DATA_INVALID', '组件数据格式不正确。');
  const items = groups.flatMap(group => group.items ?? []), ids = new Set(), examples = new Set();
  for (const item of items) {
    if (typeof item.id !== 'string' || ids.has(item.id) || !['available', 'planned'].includes(item.delivery)) throw fail('COMPONENT_DATA_INVALID', '组件编号或交付状态不正确。');
    ids.add(item.id);
    const own = contracts.filter(value => value.id === item.id);
    if (own.length !== (item.delivery === 'available' ? 1 : 0)) throw fail('COMPONENT_DATA_INVALID', item.id + ' 的交付状态与正式契约不一致。');
  }
  for (const contract of contracts) {
    if (contract.schemaVersion !== 1 || !['sdk-contract', 'sdk-pattern'].includes(contract.documentStatus) || !ids.has(contract.id) || !Array.isArray(contract.bindings) || !Array.isArray(contract.examples) || !Array.isArray(contract.sourceFiles)) throw fail('COMPONENT_DATA_INVALID', '正式契约格式不正确。');
    if (contract.documentStatus === 'sdk-pattern' && (contract.binding !== null || contract.releasedApi !== null || !contract.bindings.length)) throw fail('COMPONENT_DATA_INVALID', '组合契约只声明依赖，不声明独立组件导出或业务API。');
    for (const binding of contract.bindings) if (!binding.module?.startsWith('@ksf/sdk/') || !Array.isArray(binding.exports) || !Array.isArray(binding.runtimeExports)) throw fail('COMPONENT_DATA_INVALID', '公共绑定格式不正确。');
    for (const example of contract.examples) {
      if (typeof example.id !== 'string' || examples.has(example.id) || typeof example.file !== 'string') throw fail('COMPONENT_DATA_INVALID', '示例编号或来源不正确。');
      examples.add(example.id);
    }
  }
  return items;
}

/** Plain JavaScript export names are checked separately from declarations. No eval/import. */
export async function runtimeNames(root, file, seen = new Set()) {
  file = file.replace(/^\.\//, '');
  if (seen.has(file)) return new Set();
  seen.add(file);
  if (!/\.[cm]?js$/.test(file)) return null;
  const text = (await bytes(root, file)).toString();
  await init;
  let exports;
  try {[, exports] = parse(text);} catch {throw fail('SDK_RUNTIME_UNVERIFIED', '无法静态读取运行模块的导出。');}
  const names = new Set(exports.map(value => value.n));
  for (const match of text.matchAll(/\bexport\s*\*\s*from\s*['"]([^'"]+)['"]/g)) {
    if (!match[1].startsWith('.')) throw fail('SDK_RUNTIME_UNVERIFIED', '运行模块的外部星号转导出需要进一步核对。');
    const child = await runtimeNames(root, relative(root, resolve(root, dirname(file), match[1])).split(sep).join('/'), seen);
    if (!child) throw fail('SDK_RUNTIME_UNVERIFIED', '无法核定星号转导出的运行模块。');
    for (const name of child) if (name !== 'default') names.add(name);
  }
  return names;
}

/** Fingerprint the maintained data and source dependency closure; never import target code. */
export async function registryFiles(root, contracts) {
  const files = new Set(['package.json', 'build.mjs', 'components/catalog.json', 'components/contracts.json', 'components/proposals.json', 'components/references.json', 'THIRD_PARTY_NOTICES.txt', 'src/component-catalog.js', 'src/component-catalog.d.ts']);
  const queue = contracts.flatMap(contract => [...contract.sourceFiles, ...contract.examples.map(example => example.file)]);
  const pkg = await json(root, 'package.json');
  for (const contract of contracts) for (const binding of contract.bindings) {
    for (const runtime of [false, true]) {
      const entry = publicEntry(pkg, binding.module, {runtime});
      if (entry) queue.push(entry.replace(/^\.\//, ''));
    }
  }
  while (queue.length) {
    const file = queue.pop(); if (files.has(file)) continue;
    const source = (await bytes(root, file)).toString(); files.add(file);
    if (/\.[cm]?js$/.test(file)) {
      for (const declaration of [file.replace(/\.[cm]?js$/, '.d.ts'), file.replace(/\.[cm]?js$/, '.d.mts')]) {
        try {sourcePath(root, declaration); queue.push(declaration);} catch {}
      }
    }
    if (!/\.(?:[cm]?[jt]sx?|css)$/.test(file)) continue;
    const specs = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*|@import\s*)['"]([^'"]+)['"]/g)].map(match => match[1]);
    for (const spec of specs) {
      if (spec.startsWith('@ksf/sdk/')) {const entry=publicEntry(pkg,spec);if(!entry)throw fail('COMPONENT_SOURCE_MISSING','组件引用的公共SDK入口不存在：'+spec);queue.push(entry.replace(/^\.\//,''));continue;}
      if (!spec.startsWith('.')) continue;
      const target = relative(root, resolve(root, dirname(file), spec)).split(sep).join('/');
      const candidates = [target, ...(!extname(target) ? ['.ts', '.tsx', '.js', '.mjs', '.css', '/index.ts', '/index.js'].map(suffix => target + suffix) : [])];
      let found = false;
      for (const candidate of candidates) try {sourcePath(root, candidate); queue.push(candidate); found = true; break;} catch {}
      if (!found) throw fail('COMPONENT_SOURCE_MISSING', '组件依赖不可读：' + target);
    }
  }
  const hashes = {};
  for (const file of [...files].sort()) hashes[file] = digest(await bytes(root, file));
  return hashes;
}

export async function loadRegistry(root, {verify = true} = {}) {
  root = await realpath(root);
  const [groups, contracts, proposals, references, pkg] = await Promise.all(['components/catalog.json', 'components/contracts.json', 'components/proposals.json', 'components/references.json', 'package.json'].map(file => json(root, file)));
  if (pkg.name !== '@ksf/sdk') throw fail('TARGET_SDK_INVALID', '目标目录不是 @ksf/sdk。');
  const items = validateData(groups, contracts, proposals);
  if (references.schemaVersion !== 1 || !references.components || !Array.isArray(references.coverage)) throw fail('COMPONENT_REFERENCE_INVALID', '组件来源记录格式不正确。');
  for (const item of items) {
    const record = references.components[item.id];
    if (!record || !Array.isArray(record.target) || !Array.isArray(record.adopted)) throw fail('COMPONENT_REFERENCE_INVALID', item.id + ' 缺少来源记录。');
    if (item.delivery === 'planned' && record.adopted.length) throw fail('COMPONENT_REFERENCE_INVALID', item.id + ' 尚未实现，不能声明已采用参考版本。');
    if (![record.differences, record.notCovered].every(list => Array.isArray(list) && list.every(value => typeof value === 'string'))) throw fail('COMPONENT_REFERENCE_INVALID', item.id + ' 缺少适配差异或未覆盖范围。');
    for (const source of [...record.target, ...record.adopted]) {
      const pinned = source.versionType === 'commit' ? /^[a-f0-9]{40}$/.test(source.version) : /^\d+\.\d+\.\d+(?:-.+)?$/.test(source.version);
      if (!source.library || !source.component || !pinned || !source.sourceUrl?.startsWith('https://') || !source.documentationUrl?.startsWith('https://')) throw fail('COMPONENT_REFERENCE_INVALID', item.id + ' 参考来源必须有精确版本或commit、源码与文档链接。');
      if (source.library === 'Kokonut UI' && (source.license !== 'MIT' || source.versionType !== 'commit' || !source.sourceUrl.startsWith('https://github.com/kokonut-labs/kokonutui/blob/' + source.version + '/') || !source.documentationUrl.startsWith('https://github.com/kokonut-labs/kokonutui/blob/' + source.version + '/') || !source.licenseUrl?.endsWith('/' + source.version + '/LICENSE'))) throw fail('COMPONENT_REFERENCE_INVALID', item.id + ' Kokonut来源必须固定到免费MIT仓库的同一commit。');
      if (source.package === 'antd') {
        const prefix = 'https://github.com/ant-design/ant-design/';
        if (!['tree/', 'blob/'].some(kind => source.sourceUrl.startsWith(prefix + kind + source.version + '/')) || !source.documentationUrl.startsWith(prefix + 'blob/' + source.version + '/')) throw fail('COMPONENT_REFERENCE_INVALID', item.id + ' Ant源码与文档必须固定到记录中的版本。');
      }
    }
  }
  for (const contract of contracts) for (const example of contract.examples) for (const id of example.referenceIds ?? []) {
    const sources = [...references.components[contract.id].target, ...references.components[contract.id].adopted];
    if (!sources.some(source => source.id === id)) throw fail('COMPONENT_REFERENCE_INVALID', example.id + ' 引用了不存在的来源。');
  }
  const integrity = await json(root, 'components/integrity.json');
  if (integrity.schemaVersion !== 1 || !integrity.files || digest(JSON.stringify(integrity.files)) !== integrity.fingerprint) throw fail('COMPONENT_INTEGRITY_INVALID', '组件内容摘要格式不正确。');
  if (verify) {
    const actual = await registryFiles(root, contracts);
    if (digest(JSON.stringify(actual)) !== integrity.fingerprint) throw fail('COMPONENT_INTEGRITY_MISMATCH', '组件元数据与实际源码不同步，请维护者核对契约并重新生成摘要。');
  }
  return {root, pkg, groups, items, contracts, proposals, references, integrity, identity: {sdkVersion: pkg.version, fingerprint: integrity.fingerprint}};
}
