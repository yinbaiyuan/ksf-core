import { lstatSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hostIdentity, sessionKey } from '../routing/storage.js';
import { isToken, validateOwnership, validateTarget } from '../routing/schema.js';
import { definitionContext, resolveExistingTarget, targetLocator } from '../routing/definitions.js';
import { targetRegistry } from '../routing/target-registry.js';
import { physicalTargetKey, targetKey } from '../routing/target-identity.js';
import { canRecordWorkChange, pendingWorkChanges } from '../task-capture/route-facts.js';
import { CURRENT_WORK_KEY, location, snapshot, expect, publish, locked, encode, plain, invalid, fail } from '../chat-state/storage.js';
import { safePath } from '../user-data/storage.js';
import { readFileSnapshot, sameIdentity, withTemporaryFile } from '../shared/files.js';
import { replaceFileSync, syncDirectorySync } from '../platform/index.js';
import { sha256 } from '../shared/hash.js';
import { catalog } from '../objects/catalog.js';
import { parseReference } from '../objects/schema.js';
import { resolveObject, referenceResults } from '../objects/references.js';
import { definitionView, expandDefinitions } from '../objects/expansion.js';
import { fileReferenceLocation } from '../objects/file-locations.js';
import { readReferencedFile } from '../objects/file-references.js';
import { parseFrontmatter } from '../metadata/frontmatter.js';
import { contextEntry } from './entry-context.js';
import { project as readProject } from './projects.js';
import {projectLocations,locateProjectResource} from '../projects/governance/locations.js';

export { CURRENT_WORK_KEY };
export const MAX_SEEN = 2048;
const maximum = 1024 * 1024;
const digest = value => sha256(encode(value));
const hex = value => /^[a-f0-9]{64}$/.test(value ?? '');
const fields = (v, allowed) => plain(v) && Object.keys(v).every(k => allowed.includes(k));
const text = (v, max = 800) => typeof v === 'string' && v.trim() && Buffer.byteLength(v) <= max && !v.includes('\0');
const issue = error => ({ code: error.code ?? 'CONTEXT_READ_FAILED', message: error.message, ...error.details });
const unique = values => [...new Map(values.map(v => [encode(v), v])).values()];

function identity(options, create = false) {
  const native = hostIdentity(options.identity, options.env ?? process.env);
  return sessionKey(options.root, native, create);
}
function shared(root, key) {
  return key ? snapshot(root, location(key), 'scope', key) : { etag: 'missing', document: null };
}
function exactAbility(input, c, resolve = false) {
  if (!fields(input, ['ref', 'source']) || typeof input.ref !== 'string') invalid('Use an exact capability ref and source.');
  const parsed = parseReference(input.ref);
  if (!parsed.version || !text(input.source, 128) || !resolve && input.source === 'effective') invalid('Bind an exact version and actual source.');
  if (!resolve) return { ref: input.ref, source: input.source };
  const row = resolveObject(c, parsed, input.source);
  if (row.metadata.status === 'archived') fail('CONTEXT_ABILITY_ARCHIVED', 'An archived capability cannot execute current work.');
  return { ref: `${row.id}@${row.metadata.version}`, source: row.source };
}
function fileInput(input) {
  if (!fields(input, ['path', 'purpose']) || !text(input.path, 2048) || !text(input.purpose, 128)) invalid('A context file needs a KSF-root path and purpose.');
  const path = input.path.replace(/^\//, '');
  if (!path || /[\\\x00-\x1f]/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..')) invalid('Use a normalized path under this KSF root.');
  return { path, purpose: input.purpose };
}
function currentTarget(root, input, c) {
  let locator = input;
  if (input.targetId) {
    const target = targetRegistry(root).records.get(input.targetId);
    if (!target || target.kind !== input.kind) fail('TARGET_NOT_FOUND', 'Current target identity is unavailable.');
    if (target.lifecycle === 'planned') return null;
    locator = targetLocator(target);
  }
  if (locator.lifecycle === 'planned') return null;
  const context=c ? { root, catalog: () => c } : definitionContext(root);
  try{return resolveExistingTarget(context,locator);}catch(error){
    if(locator.kind==='project'&&locator.scope==='current'&&projectLocations(root).some(p=>p.scope==='archived'&&p.path==='档案/项目/'+locator.name+'/project.md'))return resolveExistingTarget(context,{...locator,scope:'archived'});
    throw error;
  }
}
export function validateCurrentWork(input, c, resolve = false) {
  if (input === null) return null;
  if (!fields(input, ['schemaVersion', 'goal', 'status', 'ownership', 'relatedTargets', 'executor', 'methods', 'files', 'taskRef']) ||
      input.schemaVersion !== 1 || !text(input.goal) || !['active', 'paused'].includes(input.status)) invalid('Invalid current work; use schemaVersion 1, a short goal and active/paused status.');
  validateOwnership(input.ownership);
  const relatedTargets = input.relatedTargets ?? [];
  if (!Array.isArray(relatedTargets) || relatedTargets.length > 16) invalid('Too many related targets.');
  for (const target of relatedTargets) validateTarget(target);
  const bindTarget = target => {
    const actual = resolve ? currentTarget(c.root, target, c) : null;
    // Keep stable/planned identities; persist a resolved ability locator just
    // as executor/methods do, rather than reselecting an effective source later.
    return actual && target.kind === 'ability' && !target.targetId
      ? { kind: 'ability', ref: actual.ref, source: actual.source } : target;
  };
  const ownership = input.ownership.state === 'bound'
    ? { ...input.ownership, target: bindTarget(input.ownership.target) } : input.ownership;
  const boundRelatedTargets = relatedTargets.map(bindTarget);
  if (!Array.isArray(input.methods) || input.methods.length > 32 || !Array.isArray(input.files) || input.files.length > 64) invalid('Supply bounded methods and files arrays.');
  const executor = input.executor === null ? null : exactAbility(input.executor, c, resolve);
  if (executor && executor.ref.startsWith('data-package.')) invalid('A data package is supporting material, not an executor.');
  const methods = input.methods.map(v => exactAbility(v, c, resolve));
  const files = input.files.map(fileInput);
  const taskRef = input.taskRef === null || input.taskRef === undefined ? null : fileInput({ path: input.taskRef, purpose: 'checkpoint' }).path;
  const current = { schemaVersion: 1, goal: input.goal, status: input.status, ownership, relatedTargets: boundRelatedTargets,
    executor, methods: unique(methods), files: unique(files), taskRef };
  if (Buffer.byteLength(encode(current)) > 16 * 1024) invalid('Current work exceeds 16 KiB; keep only locators, not business content.');
  return current;
}
export function readCurrentWork(options) {
  const key = identity(options), before = shared(options.root, key);
  const value = before.document?.values?.[CURRENT_WORK_KEY] ?? null;
  const current=validateCurrentWork(value),lifecycle=[];
  if(current?.ownership.state==='bound'&&current.ownership.target.kind==='project'){
    const raw=current.ownership.target,record=raw.targetId?targetRegistry(options.root).records.get(raw.targetId):null,target=record?targetLocator(record):raw,roots=projectLocations(options.root);let project=roots.find(p=>p.path===(target.scope==='archived'?'档案/项目/':'项目/')+target.name+'/project.md')??roots.find(p=>p.scope==='archived'&&p.path==='档案/项目/'+target.name+'/project.md');const seen=new Set();
    while(project&&!seen.has(project.path)){seen.add(project.path);if(project.scope==='archived')lifecycle.push({code:'PROJECT_WORK_ARCHIVED',message:'当前项目或祖先已归档；只读查阅或先恢复，不能继续执行。',path:project.path,readOnly:true});project=roots.find(p=>p.path===project.metadata.parent_project?.path);}
  }
  return { complete: true, chatId: key, etag: before.etag, current,executionBlocked:!!lifecycle.length,lifecycle };
}

function routeArrangement(current) {
  if (!current) return null;
  const target = current.ownership.target;
  const ordered = items => [...new Set(items.map(encode))].sort().map(value => JSON.parse(value));
  return {
    project: target?.kind === 'project' ? target : null,
    relatedProjects: ordered(current.relatedTargets.filter(item => item.kind === 'project')),
    executor: current.executor,
    methods: ordered(current.methods),
  };
}

function snapshotArrangement(root, arrangement, c) {
  if (!arrangement) return { project: null, arrangement: null };
  const registry = targetRegistry(root);
  function projectSnapshot(input) {
    if (!input) return null;
    const actual = currentTarget(root, input, c);
    if (!actual) {
      const planned = registry.records.get(input.targetId);
      return planned?.lifecycle === 'planned' ? planned : null;
    }
    const id = input.targetId ?? registry.aliases.get(physicalTargetKey(actual));
    const record = registry.records.get(id);
    const { name, scope } = actual;
    const displayName = readProject({ root, operation: 'read', name, scope, part: 'metadata' }).data.project.metadata?.name;
    return { ...actual, ...(typeof displayName === 'string' && displayName.trim() ? { displayName } : {}),
      ...(record ? { targetId: record.targetId, targetVersion: record.targetVersion } : {}) };
  }
  const primary = projectSnapshot(arrangement.project);
  const project = primary?.lifecycle === 'existing' ? primary : null;
  const seen = new Set(primary ? [targetKey(primary)] : []);
  const relatedProjects = [];
  for (const input of arrangement.relatedProjects) {
    const related = projectSnapshot(input);
    if (!related || seen.has(targetKey(related))) continue;
    seen.add(targetKey(related));
    relatedProjects.push(related);
  }
  const ability = ref => resolveExistingTarget({ root, catalog: () => c }, { kind: 'ability', ...ref });
  return { project, arrangement: { relatedProjects, executor: arrangement.executor ? ability(arrangement.executor) : null,
    methods: arrangement.methods.map(ability) } };
}

export function bindCurrentWork(options) {
  if (options.turnId !== undefined && !isToken(options.turnId)) invalid('Supply a native turn ID.');
  const c = catalog(options.root), current = validateCurrentWork(options.current, c, true), key = identity(options, true);
  return locked(options.root, key, () => {
    const before = shared(options.root, key); expect(before, options.ifMatch);
    const next = before.document ? structuredClone(before.document) : { schemaVersion: 1, kind: 'scope', chatId: key, revision: 0, objectId: null, runId: null, turnIds: [], values: {} };
    if (current === null) delete next.values[CURRENT_WORK_KEY]; else next.values[CURRENT_WORK_KEY] = current;
    const changed = before.document ? encode(next) !== encode(before.document) : current !== null;
    let etag = before.etag, routeFactIssue;
    if (changed) {
      next.revision++;
      const previous = routeArrangement(before.document?.values[CURRENT_WORK_KEY]);
      const arrangement = routeArrangement(current);
      if (encode(previous) !== encode(arrangement)) {
        // A change without a capturable native turn must not carry a prior version forward.
        delete next.workArrangement;
        try {
          if (options.turnId && canRecordWorkChange(options.root, key, options.turnId)) {
            const beforeKey = previous?.project ? targetKey(previous.project) : null;
            const afterKey = arrangement?.project ? targetKey(arrangement.project) : null;
            const pointer = { turnId: options.turnId, revision: next.revision, at: new Date().toISOString() };
            const prior = before.document?.workArrangement;
            const change = { ...pointer, ...snapshotArrangement(options.root, arrangement, c), projectChanged: beforeKey !== afterKey,
              ...(prior && prior.turnId !== pointer.turnId ? { previousArrangementRevision: prior.revision } : {}) };
            const pending = pendingWorkChanges(options.root, key, next.workChanges);
            if (pending.length >= 256) fail('CHAT_ROUTE_FACTS_CAPACITY', 'Pending work changes need to be collected.');
            const workChanges = [...pending, change];
            const workArrangement = current ? pointer : undefined;
            if (Buffer.byteLength(encode({ ...next, workChanges, workArrangement })) > maximum)
              fail('CHAT_ROUTE_FACTS_CAPACITY', 'Pending work changes need to be collected.');
            next.workChanges = workChanges;
            if (workArrangement) next.workArrangement = workArrangement;
          }
        } catch (error) { routeFactIssue = error.code ?? 'CHAT_ROUTE_FACTS_UNAVAILABLE'; }
      }
      etag = publish(options.root, before, next, 'scope', key);
    }
    return { complete: true, chatId: key, etag, current, changed, ...(routeFactIssue ? { routeFactIssue } : {}) };
  });
}

// Disposable cache, not a second task store. Raw snapshots also permit replacing
// corrupt JSON/UTF-8 without treating damaged business state as an empty binding.
function cache(root, key) {
  if (!key) return { etag: 'missing', generation: 'missing', active: [], seen: [] };
  const path = `.agents/runtime-data/context/${key}.json`, target = safePath(root, path);
  let entry;
  try { entry = lstatSync(target); } catch (error) { if (error.code === 'ENOENT') return { path, target, etag: 'missing', generation: 'missing', active: [], seen: [] }; throw error; }
  if (!entry.isFile() || entry.size > maximum) fail('CONTEXT_CACHE_UNAVAILABLE', 'Context cache must be a bounded ordinary file.');
  const conflict = () => fail('CHAT_CONFLICT', 'Context cache changed while reading.');
  const result = readFileSnapshot(target, { entry, validateOpen(a, b) { if (!sameIdentity(a, b)) conflict(); },
    validateRead(a, b, data) { if (!sameIdentity(a, b) || data.length > maximum) conflict(); } });
  const etag = sha256(result.bytes), before = { path, target, etag, stat: result.stat };
  try {
    const d = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(result.bytes));
    if (!fields(d, ['schemaVersion', 'generation', 'active', 'seen']) || d.schemaVersion !== 1 || !text(d.generation, 128) ||
        !Array.isArray(d.active) || d.active.length > 512 || !Array.isArray(d.seen) || d.seen.length > MAX_SEEN || !d.seen.every(hex)) throw new Error('invalid cache');
    for (const a of d.active) if (!plain(a) || !hex(a.fingerprint) || !Array.isArray(a.purposes) || !a.purposes.every(p => text(p, 128))) throw new Error('invalid manifest');
    return { ...before, ...d };
  } catch { return { ...before, generation: `invalid:${etag}`, active: [], seen: [], discarded: true }; }
}
function publishCache(root, before, document) {
  const bytes = Buffer.from(encode({ schemaVersion: 1, ...document }));
  if (bytes.length > maximum) fail('CONTEXT_CACHE_CAPACITY', 'Context cache exceeds its budget; reload current context.');
  const target = safePath(root, before.path, { createParents: true });
  return withTemporaryFile(`${target}.${randomUUID()}.tmp`, bytes, {}, temporary => {
    const key = before.path.split('/').at(-1).slice(0, -5), latest = cache(root, key);
    expect(latest, before.etag);
    replaceFileSync(temporary, target); syncDirectorySync(dirname(target));
    return sha256(bytes);
  });
}
export function resetWorkContext(options) {
  const key = identity(options, true);
  return locked(options.root, key, () => {
    const before = cache(options.root, key), generation = randomUUID();
    const etag = publishCache(options.root, before, { generation, active: [], seen: [] });
    return { complete: true, chatId: key, generation, etag };
  });
}

function abilityItem(o, content) {
  const locator = { kind: 'ability', ref: `${o.id}@${o.version}`, source: o.source, path: o.path,
    ...(o.source_root ? { sourceRoot: o.source_root } : {}), definitionDigest: o.definition_digest };
  return { ...locator, fingerprint: digest(locator), state: 'present', ...(content ? { object: o } : {}) };
}
function fileItem(f, content) {
  const locator = { kind: 'file', source: f.source, path: f.path, ...(f.source_root ? { sourceRoot: f.source_root } : {}), sha256: f.sha256, state: f.state };
  return { ...locator, fingerprint: digest(locator), ...(content ? { file: f } : {}) };
}
export function currentWorkContext(options) {
  const { root, manifestOnly = false, baseOnly = false } = options;
  const binding = readCurrentWork(options), before = cache(root, binding.chatId), errors = [], rows = new Map();
  const entry = options.entry ?? contextEntry(root);
  const add = (item, purpose) => {
    const old = rows.get(item.fingerprint);
    if (old) { if (!old.purposes.includes(purpose)) old.purposes.push(purpose); }
    else rows.set(item.fingerprint, { ...item, purposes: [purpose] });
  };
  const expanded = (items, purpose) => { for (const item of items ?? []) add(item.kind === 'file' ? fileItem(item.file, true) : abilityItem(item.object, true), purpose); };
  const parsed = parseFrontmatter(Buffer.from(entry.entry.content), entry.entry.path);
  add(abilityItem({ id: parsed.values.id ?? `entry.${entry.mode}`, source: entry.entry.source, path: entry.entry.path,
    directory: dirname(entry.entry.path), version: entry.entry.version, definition_digest: entry.entry.sha256, metadata: parsed.values, body: parsed.body.toString('utf8') }, true), 'base');
  expanded(entry.context?.expanded, 'base'); errors.push(...entry.context?.errors ?? []);
  const current = binding.current, extras = options.extras ?? [];
  if(!baseOnly&&binding.executionBlocked)errors.push(...binding.lifecycle);
  if (!Array.isArray(extras) || extras.length > 32) invalid('Too many turn-local supporting capabilities.');
  if (entry.mode === 'runtime' && !baseOnly) {
    let c;
    const definitions = () => c ??= catalog(root);
    const loadAbility = (input, purpose) => {
      try {
        const bound = exactAbility(input, definitions()), row = resolveObject(definitions(), parseReference(bound.ref), bound.source);
        if (row.metadata.status === 'archived') fail('CONTEXT_ABILITY_ARCHIVED', 'Current capability is archived.');
        add(abilityItem(definitionView(row, 'all'), true), purpose);
        const refs = referenceResults(definitions(), row), result = expandDefinitions(definitions(), row, 'all', refs);
        errors.push(...refs.filter(r => r.error).map(r => r.error), ...result?.errors ?? []);
        expanded(result?.expanded, purpose);
      } catch (error) { errors.push(issue(error)); }
    };
    const loadFile = input => {
      try {
        const f = fileInput(input);if(/^(项目|档案\/项目)\//.test(f.path)){try{f.path=locateProjectResource(root,{path:f.path}).path;}catch(e){if(e.code!=='PROJECT_REFERENCE_MISSING')throw e;}}
        const locator = fileReferenceLocation({ root }, { path: 'AGENTS.md', source: 'user' }, { path: '/' + f.path });
        add(fileItem(readReferencedFile(locator).view, true), f.purpose);
      } catch (error) { errors.push({ ...issue(error), target: input.path }); }
    };
    if (current) {
      if (current.executor) loadAbility(current.executor, 'executor');
      for (const method of current.methods) loadAbility(method, 'method');
      for (const target of [current.ownership.target, ...current.relatedTargets].filter(Boolean)) {
        if (target.lifecycle === 'planned') continue;
        try {
          const actual = currentTarget(root, target);
          if (target === current.ownership.target && actual?.kind === 'project') loadFile({ path: actual.path, purpose: 'project' });
        } catch (error) { errors.push(issue(error)); }
      }
      for (const f of current.files) loadFile(f);
      if (current.taskRef) loadFile({ path: current.taskRef, purpose: 'checkpoint' });
    }
    for (const extra of extras) loadAbility(extra, 'turn-support');
  }
  const all = [...rows.values()], active = all.map(({ object, file, ...item }) => item);
  if (active.length > 512) errors.push({ code: 'CONTEXT_CAPACITY', message: 'Current context exceeds 512 items; narrow the current stage explicitly.' });
  const seen = new Set(before.seen), pending = active.filter(i => i.state === 'present' && !seen.has(i.fingerprint));
  const now = new Map(active.map(i => [i.fingerprint, new Set(i.purposes)]));
  const retired = baseOnly ? [] : before.active.flatMap(item => {
    const purposes = item.purposes.filter(p => !now.get(item.fingerprint)?.has(p));
    return purposes.length ? [{ ...item, purposes }] : [];
  });
  if (readCurrentWork(options).etag !== binding.etag || cache(root, binding.chatId).etag !== before.etag) fail('CHAT_CONFLICT', 'Binding or context generation changed during assembly; read again.');
  const complete = errors.length === 0 && entry.complete;
  const delivery = complete && binding.chatId && !manifestOnly ? { bindingEtag: binding.etag, cacheEtag: before.etag,
    generation: before.generation, manifestDigest: digest(active), baseOnly, extras } : null;
  return { complete, mode: entry.mode, chatId: binding.chatId, bindingEtag: binding.etag, current: baseOnly ? null : current,
    generation: before.generation, cacheDiscarded: before.discarded ?? false, active, pending, retired,
    ...(!manifestOnly ? { bodies: all.filter(i => pending.some(p => p.fingerprint === i.fingerprint)), delivery } : {}), errors };
}
export function acceptWorkContext(options) {
  const d = options.delivery;
  if (!fields(d, ['bindingEtag', 'cacheEtag', 'generation', 'manifestDigest', 'baseOnly', 'extras']) || !hex(d.manifestDigest) || typeof d.baseOnly !== 'boolean') invalid('Supply the unchanged delivery returned after reading the complete context.');
  const actual = currentWorkContext({ ...options, manifestOnly: true, baseOnly: d.baseOnly, extras: d.extras });
  if (!actual.complete || actual.bindingEtag !== d.bindingEtag || actual.generation !== d.generation || digest(actual.active) !== d.manifestDigest) fail('CONTEXT_DELIVERY_CHANGED', 'Context changed since delivery; read current content before confirming.');
  const key = identity(options);
  if (!key) fail('CONTEXT_IDENTITY_REQUIRED', 'Initialize an explicit work binding or reload before confirming.');
  return locked(options.root, key, () => {
    expect(shared(options.root, key), d.bindingEtag);
    const before = cache(options.root, key); expect(before, d.cacheEtag);
    if (before.generation !== d.generation) fail('CONTEXT_DELIVERY_CHANGED', 'Context generation changed.');
    const newSeen = unique([...before.seen, ...actual.active.filter(i => i.state === 'present').map(i => i.fingerprint)]);
    const overflow = newSeen.length > MAX_SEEN;
    const seen = overflow ? actual.active.filter(i => i.state === 'present').map(i => i.fingerprint) : newSeen;
    const next = { generation: before.etag === 'missing' || before.discarded || overflow ? randomUUID() : before.generation,
      active: d.baseOnly ? before.active : actual.active, seen };
    const etag = publishCache(options.root, before, next);
    return { complete: true, chatId: key, generation: next.generation, etag, remembered: seen.length };
  });
}
export function entryWorkDelivery(options, entry) {
  return currentWorkContext({ ...options, entry, baseOnly: true }).delivery;
}
export function createWorkContext(root) {
  const call = (fn, names = []) => input => {
    if (!fields(input, ['identity', ...names]) || !input.identity) invalid('SDK work context requires an explicit native identity and supported fields.');
    return fn({ ...input, root });
  };
  return { read: call(readCurrentWork), bind: call(bindCurrentWork, ['current', 'ifMatch', 'turnId']),
    current: call(currentWorkContext, ['manifestOnly', 'extras']), accept: call(acceptWorkContext, ['delivery']), reset: call(resetWorkContext) };
}
