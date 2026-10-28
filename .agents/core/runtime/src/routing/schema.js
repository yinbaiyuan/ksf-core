import { parseReference, parseStoredReference } from '../objects/schema.js';
import { validSourceId } from '../sources/schema.js';

export const ROUTE_PROTOCOL = 'ksf-routing-v1';
export const ROUTE_DIRECTORY = '.agents/runtime-data/routing/v1';
export const HISTORY_LIMIT = 50;
export const INPUT_LIMIT = 64 * 1024;
export const RECORD_LIMIT = 4 * 1024 * 1024;
export const EVENT_LIMIT = 4096;
export const isKey = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const isToken = value => typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(value);
export const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export class RouteError extends Error {
  constructor(code, message, details = {}, exitCode = 1) { super(message); Object.assign(this, { code, details, exitCode }); }
}
export function fail(code, message, details, exitCode) { throw new RouteError(code, message, details, exitCode); }
export const invalid = message => fail('INVALID_ARGUMENTS', message, {}, 2);
export function keys(value, allowed, field) {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid(`Unsupported fields or object type in ${field}.`);
}
export function text(value, maximum = 512) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum && !/[\x00-\x1f\x7f]/.test(value);
}
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export const encode = value => JSON.stringify(canonical(value));
export function validateProject(value) {
  keys(value, ['name', 'scope'], 'project target');
  if (!text(value.name, 200) || /[\\/]/.test(value.name) || ['.', '..'].includes(value.name) || !['current', 'archived'].includes(value.scope)) invalid('Project target needs a name and current/archived scope.');
}
export const targetKinds = ['project', 'knowledge', 'ability', 'archive'];
const relativePath = (value, prefix) => text(value, 2048) && value.startsWith(prefix + '/') && value.split('/').every(p => p && p !== '.' && p !== '..' && !/[\\:\x00-\x1f]/.test(p));
export function validateTarget(value) {
  if (!plain(value) || !targetKinds.includes(value.kind)) invalid('Target kind must be project, knowledge, ability or archive.');
  if (value.targetId !== undefined) {
    keys(value, ['kind', 'targetId'], 'target identity');
    if (!isKey(value.targetId)) invalid('Supply a valid stable targetId.');
  } else if (value.lifecycle === 'planned') {
    keys(value, ['kind', 'lifecycle', 'name'], 'planned target');
    if (!text(value.name, 200)) invalid('A planned target needs an explicit name.');
  } else if (value.kind === 'project') {
    keys(value, ['kind', 'name', 'scope'], 'project target'); validateProject({ name: value.name, scope: value.scope });
  } else if (value.kind === 'knowledge') {
    keys(value, ['kind', 'path'], 'knowledge target');
    if (!relativePath(value.path, '知识') || value.path.split('/').length < 3 || !/\.md$/i.test(value.path)) invalid('Knowledge target needs an exact workspace-relative Markdown entry path.');
  } else if (value.kind === 'ability') {
    keys(value, ['kind', 'ref', 'source'], 'ability target'); parseReference(value.ref);
    if (!['effective', 'user', 'system'].includes(value.source) && !validSourceId(value.source)) invalid('Ability target needs an explicit source.');
  } else {
    keys(value, ['kind', 'path'], 'archive target');
    if (!relativePath(value.path, '档案')) invalid('Archive target needs an exact file or directory under 档案/.');
  }
}
export function validateOwnership(value) {
  keys(value, ['state', 'target'], 'ownership');
  if (!['bound', 'none', 'unresolved'].includes(value.state)) invalid('Ownership state must be bound, none or unresolved.');
  if (value.state === 'bound') validateTarget(value.target);
  else if (value.target !== undefined) invalid('Only bound ownership may have a target.');
}
const inputTargetKey = t => t.targetId ? `target:${t.targetId}` : t.lifecycle === 'planned' ? `planned:${t.kind}:${t.name}` : t.kind === 'project' ? `project:${t.scope}:${t.name}` : t.kind === 'ability' ? `ability:${t.source}:${parseReference(t.ref).id}` : `${t.kind}:${t.path}`;
export function validateStoredTarget(t) {
  if (!plain(t) || !targetKinds.includes(t.kind) || !text(t.name, 2048) ||
      (t.lifecycle !== undefined && !['planned', 'existing'].includes(t.lifecycle)) ||
      (t.targetId !== undefined && (!isKey(t.targetId) || !Number.isSafeInteger(t.targetVersion) || t.targetVersion < 1))) invalid('Invalid stored target identity.');
  if (t.lifecycle === 'planned') {
    if (!isKey(t.targetId) || t.targetVersion !== 1 || t.path !== undefined) invalid('Invalid planned target snapshot.');
    return;
  }
  if (!text(t.path, 2048)) invalid('Stored target needs its historical path.');
  if (t.kind === 'project') validateProject({ name: t.name, scope: t.scope });
  else if (t.kind === 'knowledge' || t.kind === 'archive') validateTarget({ kind: t.kind, path: t.path });
  else {
    if (!['user', 'system', 'effective'].includes(t.source) && !validSourceId(t.source)) invalid('Invalid historical ability source.');
    const ref = parseStoredReference(t.ref);
    if (ref.id !== t.id || ref.version !== t.version || !isKey(t.definitionDigest) || !['user', 'system'].includes(t.source) && !validSourceId(t.source)) invalid('Invalid ability target snapshot.');
  }
}
export function validateBindings(bindings = []) {
  if (!Array.isArray(bindings) || bindings.length > 32) invalid('targetBindings must contain at most 32 explicit bindings.');
  const seen = new Set();
  for (const b of bindings) {
    keys(b, ['targetId', 'ifMatch', 'target'], 'target binding');
    if (!isKey(b.targetId) || !Number.isSafeInteger(b.ifMatch) || b.ifMatch < 1 || seen.has(b.targetId)) invalid('A binding needs a distinct targetId and expected positive version.');
    validateTarget(b.target);
    if (b.target.targetId || b.target.lifecycle) invalid('Bind to an existing exact target locator.');
    seen.add(b.targetId);
  }
}
export function validateTargetFacts(facts = []) {
  if (!Array.isArray(facts)) invalid('Invalid target facts.');
  const events = new Set();
  for (const f of facts) {
    if (!plain(f) || !isToken(f.eventId) || !isKey(f.fingerprint) || events.has(f.eventId) || !Array.isArray(f.updates) || !f.updates.length || f.updates.length > 65) invalid('Invalid target fact event.');
    events.add(f.eventId);
    for (const u of f.updates) {
      validateStoredTarget(u.target);
      if (!isKey(u.targetId) || u.target.targetId !== u.targetId || (u.ifMatch !== 'missing' && (!Number.isSafeInteger(u.ifMatch) || u.ifMatch < 1)) ||
          u.target.targetVersion !== (u.ifMatch === 'missing' ? 1 : u.ifMatch + 1) || (u.ifMatch === 'missing' ? u.target.lifecycle !== 'planned' : u.ifMatch !== 1 || u.target.lifecycle !== 'existing')) invalid('Invalid target fact revision.');
    }
  }
}
export function validateStoredTargets(snapshot) {
  if (snapshot.ownership === undefined && snapshot.relatedTargets === undefined) return;
  const ownership = snapshot.ownership;
  if (!plain(ownership) || !['bound', 'none', 'unresolved'].includes(ownership.state) || ownership.state !== 'bound' && ownership.target !== undefined) invalid('Invalid stored ownership.');
  if (ownership.state === 'bound') validateStoredTarget(ownership.target);
  if (!Array.isArray(snapshot.relatedTargets) || snapshot.relatedTargets.length > 32) invalid('Invalid stored related targets.');
  const key = t => t.targetId ? `target:${t.targetId}` : t.kind === 'project' ? `project:${t.scope}:${t.name}` : t.kind === 'ability' ? `ability:${t.source}:${t.id}` : `${t.kind}:${t.path}`;
  const seen = new Set(ownership.state === 'bound' ? [key(ownership.target)] : []);
  for (const t of snapshot.relatedTargets) { validateStoredTarget(t); if (seen.has(key(t))) invalid('Stored targets must be distinct.'); seen.add(key(t)); }
  const primary = ownership.state === 'bound' && ownership.target.kind === 'project' && ownership.target.lifecycle !== 'planned' ? ownership.target : null;
  const expectedState = primary ? 'bound' : ownership.state === 'bound' ? 'none' : ownership.state;
  if (snapshot.project?.state !== expectedState || (primary && ['name', 'scope', 'path'].some(k => primary[k] !== snapshot.project.primary?.[k]))) invalid('Ownership and legacy project projection disagree.');
  const refs = snapshot.relatedTargets.filter(t => t.kind === 'project' && t.lifecycle !== 'planned');
  if (refs.length !== snapshot.references?.length || refs.some((t, i) => ['name', 'scope', 'path'].some(k => t[k] !== snapshot.references[i]?.[k]))) invalid('Related targets and legacy references disagree.');
}
export function validateReport(report) {
  keys(report, ['summary', 'project', 'references', 'ownership', 'relatedTargets', 'abilities', 'status'], 'report');
  if (!text(report.summary) || !['preparing', 'working', 'waiting', 'blocked', 'completed', 'paused', 'cancelled'].includes(report.status)) invalid('Supply a short summary and a supported reported status.');
  const unified = report.ownership !== undefined || report.relatedTargets !== undefined;
  if (unified) {
    if (report.project !== undefined || report.references !== undefined) invalid('Do not mix ownership/relatedTargets with project/references.');
    validateOwnership(report.ownership);
    const related = report.relatedTargets ?? [];
    if (!Array.isArray(related) || related.length > 32) invalid('relatedTargets must be an array of at most 32 targets.');
    const targets = new Set(report.ownership.state === 'bound' ? [inputTargetKey(report.ownership.target)] : []);
    for (const target of related) { validateTarget(target); const key = inputTargetKey(target); if (targets.has(key)) invalid('Primary and related targets must be distinct.'); targets.add(key); }
  } else {
    keys(report.project, ['state', 'primary'], 'report.project');
    if (!['bound', 'none', 'unresolved'].includes(report.project.state)) invalid('Project state must be bound, none or unresolved.');
    if (report.project.state === 'bound') validateProject(report.project.primary);
    else if (report.project.primary !== undefined) invalid('Only a bound project may have a primary target.');
    if (!Array.isArray(report.references) || report.references.length > 32) invalid('references must be an array of at most 32 project targets.');
    const projects = new Set(report.project.primary ? [encode(report.project.primary)] : []);
    for (const target of report.references) {
      validateProject(target);
      const key = encode(target);
      if (projects.has(key)) invalid('Primary and referenced projects must be distinct.');
      projects.add(key);
    }
  }
  if (!Array.isArray(report.abilities) || report.abilities.length > 128) invalid('abilities must be an array of at most 128 explicitly reported definitions.');
  const abilities = new Set();
  for (const ability of report.abilities) {
    keys(ability, ['ref', 'source', 'definitionDigest', 'stage'], 'ability');
    const ref = parseReference(ability.ref);
    if (!ref.version || !['selected', 'read', 'adopted'].includes(ability.stage) ||
        (!['system', 'user', 'effective'].includes(ability.source) && !validSourceId(ability.source))) invalid('An ability needs an exact ref, source and selected/read/adopted stage.');
    if (ability.definitionDigest !== undefined && !isKey(ability.definitionDigest)) invalid('definitionDigest must be a SHA-256 digest.');
    if (ability.stage !== 'selected' && !isKey(ability.definitionDigest)) invalid('Read/adopted abilities require the definition_digest returned by object read.');
    if (abilities.has(ability.ref)) invalid('Each ability ref may be reported only once.');
    abilities.add(ability.ref);
  }
}
export function validateRequest(operation, input) {
  keys(input, operation === 'start' ? ['identity', 'eventId', 'report', 'targetBindings'] : ['identity', 'eventId', 'roundId', 'report', 'targetBindings'], 'route input');
  if (!isToken(input.eventId) || (operation === 'write' && !isToken(input.roundId))) invalid('Supply eventId and, for write, the roundId returned by start.');
  validateReport(input.report);
  validateBindings(input.targetBindings);
  if (Buffer.byteLength(encode(input)) > INPUT_LIMIT) invalid('Route input exceeds 64 KiB.');
}
export function validateRecord(document, key) {
  const corrupt = () => fail('ROUTE_RECORD_INVALID', 'Invalid routing record; preserve the original file.');
  if (!plain(document) || document.protocol !== ROUTE_PROTOCOL) fail('ROUTE_VERSION_UNSUPPORTED', 'Unsupported routing protocol; preserve the original file.');
  if (document.sessionKey !== key || !text(document.host, 64) || !Number.isSafeInteger(document.revision) || document.revision < 1 ||
      !isToken(document.roundId) || !Number.isFinite(Date.parse(document.updatedAt)) ||
      !Number.isSafeInteger(document.historyDropped) || document.historyDropped < 0 || !Array.isArray(document.history) ||
      document.history.length < 1 || document.history.length > HISTORY_LIMIT || !Array.isArray(document.events) || document.events.length > EVENT_LIMIT ||
      document.events.length !== document.revision || document.history.length + document.historyDropped !== document.revision) corrupt();
  const validateSnapshot = snapshot => {
    if (!plain(snapshot) || !text(snapshot.summary) || !Array.isArray(snapshot.abilities) || snapshot.abilities.length > 128 ||
        !Array.isArray(snapshot.references) || !plain(snapshot.project) || !['bound', 'none', 'unresolved'].includes(snapshot.project.state) ||
        !['preparing', 'working', 'waiting', 'blocked', 'completed', 'paused', 'cancelled'].includes(snapshot.status)) corrupt();
    const project = target => {
      if (!plain(target) || !text(target.path)) corrupt();
      try { validateProject({ name: target.name, scope: target.scope }); } catch { corrupt(); }
    };
    if (snapshot.project.state === 'bound') project(snapshot.project.primary);
    else if (snapshot.project.primary !== undefined) corrupt();
    snapshot.references.forEach(project);
    try { validateStoredTargets(snapshot); } catch { corrupt(); }
    for (const a of snapshot.abilities) {
      if (!plain(a) || !text(a.id) || !text(a.name) || !text(a.ref) || !text(a.version) || !text(a.source) || !text(a.path, 4096) ||
          !isKey(a.definitionDigest) || typeof a.fixed !== 'boolean' || !['selected', 'read', 'adopted'].includes(a.stage) ||
          (!['user', 'system'].includes(a.source) && !validSourceId(a.source)) ||
          (a.userRevision !== null && (!Number.isSafeInteger(a.userRevision) || a.userRevision < 1))) corrupt();
      try { const ref = parseStoredReference(a.ref); if (ref.id !== a.id || ref.version !== a.version) corrupt(); } catch { corrupt(); }
    }
  };
  try { validateTargetFacts(document.targetFacts); } catch { corrupt(); }
  validateSnapshot(document.current);
  for (let i = 0; i < document.history.length; i++) {
    const h = document.history[i];
    if (!plain(h) || h.revision !== document.historyDropped + i + 1 || !isToken(h.roundId) || !isToken(h.eventId) ||
        !Number.isFinite(Date.parse(h.at)) || !['start', 'write'].includes(h.operation)) corrupt();
    validateSnapshot(h.snapshot);
  }
  const events = new Set();
  for (let i = 0; i < document.events.length; i++) {
    const event = document.events[i];
    if (!plain(event) || !isToken(event.id) || !isToken(event.roundId) || !isKey(event.digest) || event.revision !== i + 1 ||
        !['start', 'write'].includes(event.operation) || events.has(event.id)) corrupt();
    events.add(event.id);
  }
  const last = document.history.at(-1);
  for (const h of document.history) {
    const event = document.events[h.revision - 1];
    if (event.id !== h.eventId || event.roundId !== h.roundId || event.operation !== h.operation) corrupt();
  }
  if (last.roundId !== document.roundId || last.at !== document.updatedAt || encode(last.snapshot) !== encode(document.current)) corrupt();
  return document;
}
