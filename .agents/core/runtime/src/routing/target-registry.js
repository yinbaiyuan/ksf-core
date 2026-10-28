import { createHash } from 'node:crypto';
import { existsSync, lstatSync, unlinkSync } from 'node:fs';
import { withExclusiveLock, sameIdentity } from '../shared/files.js';
import { managedPath, recordKeys, loadRecord } from './storage.js';
import { taskIds, turns, readJSON } from '../task-capture/storage.js';
import { encode, fail, validateTargetFacts } from './schema.js';
import { physicalTargetKey } from './target-identity.js';
import { currentObjectId } from '../objects/legacy.js';

export const changesFingerprint = changes => createHash('sha256').update(encode(changes)).digest('hex');
/** Rebuildable, read-only projection. Facts live in their original turn/session, never in a second task database. */
export function targetRegistry(root) {
  const records = new Map(), events = new Map(), revisions = new Map(), aliases = new Map(), errors = [], observed = [], conflicted = new Set();
  const gap = (error, owner) => errors.push({ code: error.code ?? 'TARGET_FACTS_INVALID', message: error.message, ...owner });
  const add = (facts, origin, owner) => {
    try {
      validateTargetFacts(facts);
      for (const fact of facts ?? []) {
        const key = `${origin}:${fact.eventId}`;
        events.set(key, fact);
        for (const u of fact.updates) {
          const revisionKey = `${u.targetId}:${u.target.targetVersion}`, prior = revisions.get(revisionKey);
          if (prior && (prior.origin !== key || encode(prior.target) !== encode(u.target))) {
            conflicted.add(u.targetId); fail('TARGET_FACTS_CONFLICT', 'Conflicting target facts; preserve the original records.');
          }
          revisions.set(revisionKey, { origin: key, target: u.target });
          if (!records.has(u.targetId) || records.get(u.targetId).targetVersion < u.target.targetVersion) records.set(u.targetId, u.target);
        }
      }
    } catch (error) { gap(error, owner); }
  };
  for (const taskId of taskIds(root)) {
    try { for (const turn of turns(root, taskId, { onError(e, turnId) { gap(e, { taskId, turnId }); } })) if (turn.policy === 'capture') { add(turn.targetFacts, `${taskId}:${turn.turnId}`, { taskId, turnId: turn.turnId }); for (const event of turn.routes) observed.push(event.snapshot); } }
    catch (e) { gap(e, { taskId }); }
  }
  for (const key of recordKeys(root)) {
    try { const record = loadRecord(root, key).document; add(record?.targetFacts, key, { sessionKey: key }); if (record) observed.push(record.current, ...record.history.map(e => e.snapshot)); }
    catch (e) { gap(e, { sessionKey: key }); }
  }
  // Later allowed snapshots carry the known identity even if its original creation round was explicitly excluded.
  for (const snapshot of observed) for (const t of [snapshot.ownership?.target, ...(snapshot.relatedTargets ?? [])].filter(Boolean)) if (t.targetId && !conflicted.has(t.targetId) && (!records.has(t.targetId) || records.get(t.targetId).targetVersion < t.targetVersion)) records.set(t.targetId, t);
  for (const id of conflicted) records.delete(id);
  for (const [id, target] of records) if (target.lifecycle !== 'planned') {
    const keys = [physicalTargetKey(target)];
    if (target.kind === 'ability' && currentObjectId(target.id) !== target.id) keys.push(physicalTargetKey({ ...target, id: currentObjectId(target.id) }));
    for (const key of keys) {
      const old = aliases.get(key);
      if (old && old !== id) { errors.push({ code: 'TARGET_ALIAS_CONFLICT', message: 'An exact locator has conflicting stable target identities.' }); aliases.set(key, null); }
      else if (!aliases.has(key)) aliases.set(key, id);
    }
  }
  return { records, events, aliases, errors };
}
export function withTargetLock(root, operation) {
  const relative = '.agents/runtime-data/task-targets/registry.lock', path = managedPath(root, relative, true);
  if (existsSync(path)) {
    let before, owner;
    try { before = lstatSync(path); owner = readJSON(root, relative); }
    catch (error) { if (!['ENOENT', 'TASK_DATA_INVALID', 'TASK_CONFLICT'].includes(error.code)) throw error; }
    if (before && Number.isSafeInteger(owner?.pid) && owner.pid > 0) {
      try { process.kill(owner.pid, 0); }
      catch (error) { if (error.code === 'ESRCH') { try { if (sameIdentity(before, lstatSync(path))) unlinkSync(path); } catch (missing) { if (missing.code !== 'ENOENT') throw missing; } } }
    }
  }
  return withExclusiveLock(path, { pid: process.pid }, operation, {
    onLocked() { fail('TARGET_LOCKED', 'Another capture is updating target identities; retry.'); },
  });
}
/** Caller publishes returned facts with its owning turn/session while holding the target lock. */
export function acceptTargetChanges(registry, changes, { origin, eventId, verify }) {
  const fingerprint = changesFingerprint(changes), key = `${origin}:${eventId}`, replay = registry.events.get(key);
  if (replay) {
    if (replay.fingerprint !== fingerprint) fail('TARGET_EVENT_CONFLICT', 'Target event was already accepted with different content.');
    return replay;
  }
  if (registry.errors.length) fail('TARGET_REGISTRY_INCOMPLETE', 'Cannot change target identities while target facts have reading gaps.');
  validateTargetFacts([{ eventId, fingerprint, updates: changes }]);
  const current = new Map(registry.records), aliases = new Map(registry.aliases);
  for (const u of changes) {
    const before = current.get(u.targetId);
    if ((before?.targetVersion ?? 'missing') !== u.ifMatch) fail('TARGET_CONFLICT', 'Target version changed; read and reconcile before binding.', { targetId: u.targetId, expected: u.ifMatch, actual: before?.targetVersion ?? 'missing' });
    if (before && (before.lifecycle !== 'planned' || before.kind !== u.target.kind)) fail('TARGET_BINDING_INVALID', 'Only a planned target can be bound to an existing target of the same kind.');
    if (u.target.lifecycle !== 'planned') {
      verify?.(u.target);
      const physical = physicalTargetKey(u.target), alias = aliases.get(physical);
      if (aliases.has(physical) && alias !== u.targetId) fail('TARGET_ALIAS_CONFLICT', 'This exact target is already bound to another identity.');
      aliases.set(physical, u.targetId);
    }
    current.set(u.targetId, u.target);
  }
  const fact = { eventId, fingerprint, updates: changes };
  validateTargetFacts([fact]);
  registry.records = current; registry.aliases = aliases; registry.events.set(key, fact);
  return fact;
}
