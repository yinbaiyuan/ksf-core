import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {searchComponentRecords} from '../../src/component-catalog.js';
import {loadRegistry, publicEntry, runtimeNames, bytes, json, digest} from './registry.mjs';
import {resolveTarget} from './target.mjs';
import {checkTypes} from './typecheck.mjs';

const sdkRoot = fileURLToPath(new URL('../..', import.meta.url));
const protocol = 'ksf-components-v1';
const issue = (status, reason, message) => ({status, reason, ...(message ? {message} : {})});
const errorResult = (operation, code, message, extra = {}) => ({...extra, protocol, ok: false, operation, error: {code, message}, canGenerateSdkUsage: false});

async function executeQuery({operation, selector = '', appDir, sdkRoot: explicitSDK, includePlanned = false, includeProposal = false, limit = 20, library, kind} = {}) {
  if (!['search', 'read', 'example'].includes(operation) || typeof selector !== 'string' || !Number.isInteger(limit) || limit < 1 || limit > 200 || typeof includePlanned !== 'boolean' || typeof includeProposal !== 'boolean' || library !== undefined && typeof library !== 'string' || kind !== undefined && !['component','composition'].includes(kind) || appDir !== undefined && typeof appDir !== 'string' || explicitSDK !== undefined && typeof explicitSDK !== 'string') return errorResult(operation, 'COMPONENT_QUERY_INVALID', '查询操作、选择器或参数不正确。');
  let reference;
  try {reference = await loadRegistry(sdkRoot);} catch (error) {return errorResult(operation, error.code ?? 'COMPONENT_REFERENCE_INVALID', error.message);}
  const resolution = await resolveTarget({appDir, sdkRoot: explicitSDK});
  const base = {protocol, ok: true, operation, catalogSource: reference.identity, target: resolution.target};
  let targetRegistry;
  const inspect = async (component, requestedExample, deferTypes = false) => {
    const referenceContract = reference.contracts.find(contract => contract.id === component.id) ?? null;
    if (component.delivery === 'planned') return {support: issue('notApplicable', 'COMPONENT_NOT_IMPLEMENTED'), contract: null, source: null};
    if (resolution.issue) return {support: issue('unknown', resolution.issue, resolution.message), contract: referenceContract, source: reference.identity};
    const root = resolution.target.sdkRoot;
    let pkg, candidate;
    try {
      pkg = await json(root, 'package.json');
      candidate = (await json(root, 'components/contracts.json')).find(contract => contract.id === component.id);
    } catch (error) {
      const missing = referenceContract?.bindings.find(binding => !publicEntry(pkg ?? {}, binding.module));
      const conditional = missing && (Object.hasOwn(pkg?.exports ?? {}, './' + missing.module.slice('@ksf/sdk/'.length)) || Object.keys(pkg?.exports ?? {}).some(key => key.includes('*')));
      return {support: missing && pkg ? issue(conditional ? 'unknown' : 'unsupported', conditional ? 'SDK_EXPORT_UNRESOLVED' : 'SDK_EXPORT_MISSING', missing.module) : issue('unknown', error.code === 'ENOENT' ? 'SDK_METADATA_MISSING' : 'SDK_METADATA_INVALID', '无法核定目标SDK的正式组件契约。'), contract: null, source: null};
    }
    if (!candidate || !Array.isArray(candidate.bindings)) return {support: issue('unsupported', 'SDK_COMPONENT_UNAVAILABLE'), contract: null, source: null};
    try {
      for (const binding of candidate.bindings) {
        const entry = publicEntry(pkg, binding.module);
        if (!entry) {
          const conditional = Object.hasOwn(pkg.exports ?? {}, './' + binding.module.slice('@ksf/sdk/'.length)) || Object.keys(pkg.exports ?? {}).some(key => key.includes('*'));
          return {support: issue(conditional ? 'unknown' : 'unsupported', conditional ? 'SDK_EXPORT_UNRESOLVED' : 'SDK_EXPORT_MISSING', binding.module), contract: null, source: null};
        }
        await bytes(root, entry);
        const runtimeEntry = publicEntry(pkg, binding.module, {runtime: true});
        if (!runtimeEntry) return {support: issue('unknown', 'SDK_RUNTIME_EXPORT_UNRESOLVED', binding.module), contract: null, source: null};
        await bytes(root, runtimeEntry);
        const names = await runtimeNames(root, runtimeEntry);
        if (names && (binding.runtimeExports ?? []).some(name => !names.has(name))) return {support: issue('unsupported', 'SDK_NAMED_EXPORT_MISSING', binding.module), contract: null, source: null};
      }
      targetRegistry ??= await loadRegistry(root);
      const contract = targetRegistry.contracts.find(value => value.id === component.id);
      const selected = requestedExample ? contract.examples.find(example => example.id === requestedExample) : undefined;
      if (requestedExample && !selected) return {support: issue('unsupported', 'EXAMPLE_NOT_SUPPORTED', '目标SDK没有这个示例；不会替换成其他示例。'), contract, source: targetRegistry.identity};
      if (deferTypes) return {contract, source: targetRegistry.identity, pendingTypecheck: true};
      const support = await checkTypes(targetRegistry, contract, resolution, selected);
      if (support.status === 'supported') {
        const current = await loadRegistry(root);
        if (current.identity.fingerprint !== targetRegistry.identity.fingerprint) return {support: issue('unknown', 'SDK_CHANGED_DURING_QUERY', '查询过程中SDK内容已变化，请重新查询。'), contract: null, source: null};
      }
      return {support, contract, source: targetRegistry.identity, selected};
    } catch (error) {
      return {support: issue(error.code === 'ENOENT' ? 'unsupported' : 'unknown', error.code === 'ENOENT' ? 'SDK_ENTRY_MISSING' : error.code ?? 'SDK_METADATA_INVALID', error.message), contract: null, source: null};
    }
  };
  if (operation === 'search') {
    const records = searchComponentRecords(selector, {includePlanned, limit, records: reference.items, library, kind});
    const results = [];
    // Bound work: only the requested matches are inspected, never the entire catalog's API.
    for (const component of records) results.push(await inspect(component, undefined, true));
    const pending = results.filter(result => result.pendingTypecheck);
    if (pending.length) {
      // One compiler program verifies the complete requested set. Failed batches
      // retain individual probes so one invalid example cannot taint other matches.
      const batch = await checkTypes(targetRegistry, pending.map(result => result.contract), resolution);
      for (const result of pending) {
        result.support = batch.status === 'supported'
          ? {...batch, proof: {...batch.proof, exampleIds: result.contract.examples.map(example => example.id)}}
          : await checkTypes(targetRegistry, result.contract, resolution);
      }
      try {
        const current = await loadRegistry(resolution.target.sdkRoot);
        if (current.identity.fingerprint !== targetRegistry.identity.fingerprint) {
          for (const result of pending) if (result.support.status === 'supported') result.support = issue('unknown', 'SDK_CHANGED_DURING_QUERY', '查询过程中SDK内容已变化，请重新查询。');
        }
      } catch (error) {
        for (const result of pending) if (result.support.status === 'supported') result.support = issue(error.code === 'ENOENT' ? 'unsupported' : 'unknown', error.code === 'ENOENT' ? 'SDK_ENTRY_MISSING' : error.code ?? 'SDK_METADATA_INVALID', error.message);
      }
    }
    const items = records.map((component, index) => ({id: component.id, name: component.name, label: component.label, kind: component.kind, purpose: component.purpose, delivery: component.delivery, references: (targetRegistry ?? reference).references.components[component.id], targetSupport: results[index].support, canGenerateSdkUsage: results[index].support.status === 'supported'}));
    return {...base, items};
  }
  let component;
  if (operation === 'example') {
    const contract = reference.contracts.find(value => value.examples.some(example => example.id === selector));
    if (!contract) {
      const record = reference.items.find(value => [value.id, value.name, value.label].some(key => key.toLowerCase() === selector.toLowerCase()));
      if (record?.delivery === 'planned') return errorResult(operation, 'COMPONENT_NOT_IMPLEMENTED', '组件尚未实现，没有可接入示例。', {...base, component: record, targetSupport: issue('notApplicable', 'COMPONENT_NOT_IMPLEMENTED'), example: null, binding: null});
      return errorResult(operation, 'EXAMPLE_NOT_FOUND', '没有这个示例编号；不会自动回退到第一份示例。', base);
    }
    component = reference.items.find(value => value.id === contract.id);
  } else {
    const key = selector.trim().toLowerCase();
    const matches = reference.items.filter(item => [item.id, item.name, item.label].some(value => value.toLowerCase() === key));
    if (matches.length !== 1) return errorResult(operation, 'COMPONENT_NOT_FOUND', '没有唯一匹配的组件，请使用稳定编号。', base);
    component = matches[0];
  }
  const result = await inspect(component, operation === 'example' ? selector : undefined);
  const common = {...base, component, references: (targetRegistry ?? reference).references.components[component.id], targetSupport: result.support, contractSource: result.source, canGenerateSdkUsage: result.support.status === 'supported'};
  if (operation === 'example') {
    if (result.support.status !== 'supported') return errorResult(operation, result.support.reason, result.support.message ?? '目标核对未通过，不返回可接入示例。', {...common, example: null, binding: null});
    const source = (await bytes(resolution.target.sdkRoot, result.selected.file)).toString();
    if (digest(source) !== targetRegistry.integrity.files[result.selected.file]) return errorResult(operation, 'SDK_CHANGED_DURING_QUERY', '读取示例时SDK内容已变化，请重新查询。', {...common, example: null, binding: null});
    return {...common, binding: result.contract.binding, prerequisites: result.contract.prerequisites, example: {...result.selected, source, sha256: digest(source)}};
  }
  return {...common, contract: result.contract, binding: result.contract?.binding ?? null, releasedApi: result.contract?.releasedApi ?? null, examples: result.contract?.examples ?? [],
    ...(includeProposal ? {proposal: reference.proposals.find(value => value.id === component.id) ?? null} : {})};
}

export async function queryComponents(request = {}) {
  try {return await executeQuery(request);}
  catch (error) {return errorResult(request?.operation, error.code ?? 'COMPONENT_QUERY_FAILED', error.message);}
}

export const componentQueryHelp = {operations: ['search <关键词>', 'read <组件编号或名称>', 'example <示例编号>'], options: ['--app-dir <应用源码目录>', '--sdk-root <显式SDK目录>', '--include-planned', '--include-proposal', '--limit <1..200>', '--library <Ant Design|Kokonut UI>', '--kind <component|composition>', '--json'], note: '离线只读；不安装依赖，不执行应用代码，不推测未交付入口。支持结论不代替宿主或业务验收。'};

export async function runComponentsCLI(args) {
  if (!args.length || args.includes('--help')) return {protocol, ok: true, help: componentQueryHelp};
  const operation = args[0], values = [], options = {};
  const switches = new Map([['--json', 'json'], ['--include-planned', 'includePlanned'], ['--include-proposal', 'includeProposal']]);
  const flags = new Map([['--app-dir', 'appDir'], ['--sdk-root', 'sdkRoot'], ['--limit', 'limit'], ['--library', 'library'], ['--kind', 'kind']]);
  const seen = new Set();
  for (let index = 1; index < args.length; index++) {
    const value = args[index];
    if (value.startsWith('--')) {
      if (seen.has(value)) return errorResult(operation, 'COMPONENT_QUERY_INVALID', '参数重复：' + value);
      seen.add(value);
      if (switches.has(value)) options[switches.get(value)] = true;
      else if (flags.has(value)) {
        const next = args[++index];
        if (!next || next.startsWith('--')) return errorResult(operation, 'COMPONENT_QUERY_INVALID', '参数缺少取值：' + value);
        options[flags.get(value)] = value === '--limit' ? Number(next) : next;
      } else return errorResult(operation, 'COMPONENT_QUERY_INVALID', '未知参数：' + value);
    } else values.push(value);
  }
  if (values.length > 1 || !values.length && operation !== 'search' || options.sdkRoot && !options.appDir) return errorResult(operation, 'COMPONENT_QUERY_INVALID', '需要一个选择器；--sdk-root 须同时指定目标应用。');
  return queryComponents({operation, selector: values[0] ?? '', ...options});
}
