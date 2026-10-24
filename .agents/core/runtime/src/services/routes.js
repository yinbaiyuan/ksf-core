import { randomUUID } from 'node:crypto';
import { sha256 } from '../shared/hash.js';
import { readUserData } from './user-data.js';
import { ROUTE_PROTOCOL, HISTORY_LIMIT, EVENT_LIMIT, encode, fail, invalid, isKey, validateRequest } from '../routing/schema.js';
import { hostIdentity, sessionKey, loadRecord, recordKeys, withRecordLock, publishRecord } from '../routing/storage.js';
import { definitionContext, resolveReport, decorateRecord, prepareBindings, verifyTargetSnapshot } from '../routing/definitions.js';
import { targetRegistry, withTargetLock, acceptTargetChanges } from '../routing/target-registry.js';
import { taskRouteProjections } from './tasks.js';

export function routingEnabled(root) { return readUserData({ root, namespace: 'settings' }).values.routing?.enabled ?? true; }
export function mutateRoute({ root, operation, input, ifMatch, noSave = false, env = process.env }, { beforePublish } = {}) {
  if (!['start', 'write'].includes(operation)) invalid('Expected route start or write.');
  validateRequest(operation, input);
  if (ifMatch !== 'missing' && (!Number.isSafeInteger(ifMatch) || ifMatch < 1)) invalid('Supply --if-match missing or the current positive revision.');
  if (operation === 'write' && ifMatch === 'missing') invalid('write requires an existing revision.');
  if (noSave || env.KSF_ROUTE_NO_SAVE === '1') return { skipped: true, reason: 'no-save', record: null };
  if (!routingEnabled(root)) return { skipped: true, reason: 'disabled', record: null };
  const identity = hostIdentity(input.identity, env);
  const capturedKey = sessionKey(root, identity);
  if (capturedKey && taskRouteProjections(root).records.some(r => r.sessionKey === capturedKey)) fail('ROUTE_TASK_ARCHIVE_ACTIVE', 'This Codex task uses native-turn declarations. Use task declare; its archive is the route projection source.');
  // Resolve everything before the first local write, including creation of the key.
  const context = definitionContext(root);
  context.targetSeed = randomUUID();
  const digest = sha256(encode({ operation, report: input.report, roundId: input.roundId ?? null, ...(input.targetBindings?.length ? { targetBindings: input.targetBindings } : {}) }));
  let key = sessionKey(root, identity);
  // A valid replay remains idempotent even when its source definitions later change.
  const replay = document => {
    const prior = document?.events.find(event => event.id === input.eventId);
    if (!prior) return null;
    if (prior.digest !== digest) fail('ROUTE_EVENT_CONFLICT', 'eventId was already used with different content.');
    return { skipped: false, replayed: true, accepted: prior, record: decorateRecord(context, document) };
  };
  const existing = key ? loadRecord(root, key) : { document: null, digest: null };
  const duplicate = replay(existing.document);
  if (duplicate) return duplicate;
  const expect = document => {
    if ((document?.revision ?? 'missing') !== ifMatch) fail('ROUTE_CONFLICT', 'Record revision changed; read and reconcile before retrying.', { expected: ifMatch, actual: document?.revision ?? 'missing' });
    if (operation === 'write' && document?.roundId !== input.roundId) fail('ROUTE_ROUND_CONFLICT', 'This round is no longer current; do not overwrite the newer round.');
    if ((document?.events.length ?? 0) >= EVENT_LIMIT) fail('ROUTE_CAPACITY', 'Session reached 4096 events; preserve and inspect its record.');
  };
  expect(existing.document);
  prepareBindings(context, input.targetBindings);
  const current = resolveReport(context, input.report);
  key ??= sessionKey(root, identity, true);
  return withRecordLock(root, key, () => {
    const before = loadRecord(root, key), document = before.document;
    const repeated = replay(document);
    if (repeated) return repeated;
    expect(document);
    const revision = (document?.revision ?? 0) + 1, roundId = operation === 'start' ? randomUUID() : input.roundId;
    const updatedAt = new Date().toISOString();
    const event = { id: input.eventId, digest, operation, revision, roundId };
    const history = [...(document?.history ?? []), { eventId: input.eventId, operation, revision, roundId, at: updatedAt, snapshot: current }];
    const dropped = Math.max(0, history.length - HISTORY_LIMIT);
    const next = { protocol: ROUTE_PROTOCOL, host: identity.host, sessionKey: key, revision, roundId, updatedAt, current,
      history: history.slice(dropped), historyDropped: (document?.historyDropped ?? 0) + dropped, events: [...(document?.events ?? []), event] };
    const publish = () => {
    if (context.targetChanges.size) {
      const fact = acceptTargetChanges(targetRegistry(root), [...context.targetChanges.values()], { origin: key, eventId: input.eventId, verify: target => verifyTargetSnapshot(definitionContext(root), target) });
      next.targetFacts = [...(document?.targetFacts ?? []), fact];
    } else if (document?.targetFacts) next.targetFacts = document.targetFacts;
    publishRecord(root, key, before, next, () => {
      beforePublish?.();
      const fresh = definitionContext(root); fresh.targetSeed = context.targetSeed; prepareBindings(fresh, input.targetBindings);
      if (encode(resolveReport(fresh, input.report)) !== encode(current)) fail('ROUTE_DEFINITION_CHANGED', 'Project or ability definitions changed before publication; reconcile before retrying.');
    });
    return { skipped: false, replayed: false, accepted: event, record: decorateRecord(definitionContext(root), next) };
    };
    return context.targetChanges.size ? withTargetLock(root, publish) : publish();
  });
}
export function readRoute({ root, key, identity, env = process.env }) {
  if (key !== undefined && !isKey(key)) invalid('Invalid session key.');
  key ??= sessionKey(root, hostIdentity(identity, env));
  const projection = taskRouteProjections(root), error = projection.errors.find(e => e.sessionKey === key);
  if (error) fail(error.code, error.message);
  const document = projection.records.find(r => r.sessionKey === key) ?? (key ? loadRecord(root, key).document : null);
  return { enabled: routingEnabled(root), state: document ? 'present' : 'missing', sessionKey: key,
    record: document ? decorateRecord(definitionContext(root), document) : null };
}
export function listRoutes({ root, limit = 50, offset = 0 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) invalid('Use limit 1–100 and a nonnegative offset.');
  const enabled = routingEnabled(root), context = definitionContext(root), records = [], errors = [];
  for (const key of recordKeys(root)) {
    try {
      const document = loadRecord(root, key).document;
      if (document) records.push(document);
    } catch (error) { errors.push({ sessionKey: key, code: error.code ?? 'ROUTE_READ_FAILED', message: error.message }); }
  }
  const projections = taskRouteProjections(root);
  errors.push(...projections.errors);
  for (const record of projections.records) {
    const i = records.findIndex(r => r.sessionKey === record.sessionKey);
    if (i >= 0) records.splice(i, 1);
    records.push(record);
  }
  records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.sessionKey.localeCompare(b.sessionKey));
  return { enabled, complete: errors.length === 0, total: records.length, offset, limit,
    nextOffset: offset + limit < records.length ? offset + limit : null,
    records: records.slice(offset, offset + limit).map(document => {
      const { history, ...record } = decorateRecord(context, document);
      return record;
    }), errors };
}
