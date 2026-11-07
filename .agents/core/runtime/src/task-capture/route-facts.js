import { CURRENT_WORK_KEY, abilitySnapshots, location, locked, publish, snapshot, turnsPath } from '../chat-state/storage.js';
import { validateOwnership, validateProject } from '../routing/schema.js';
import { targetRegistry } from '../routing/target-registry.js';
import { config, readJSON, readTurn, taskPath } from './storage.js';
import { readUserData } from '../services/user-data.js';

export function openingWorkRevision(facts) {
  return facts?.startingArrangementRevision ?? facts?.workChanges[0]?.previousArrangementRevision;
}

export function canRecordWorkChange(root, chatId, turnId) {
  if (!config(root)?.enabled || readUserData({ root, namespace: 'settings' }).values.routing?.enabled === false) return false;
  const ledger = snapshot(root, turnsPath(chatId), 'turns', chatId).document;
  const head = readJSON(root, `${taskPath(chatId)}/task.json`);
  if (head?.lastTurn?.turnId !== turnId || ledger && ledger.turnIds.at(-1) !== turnId) return false;
  const turn = readTurn(root, chatId, turnId);
  // The prompt Hook can run before the native user message is flushed. Stage
  // the change there; only mergeTurn can publish it after capture is allowed.
  return !!turn?.routeFacts && !turn.completedAt && turn.policy !== 'exclude' && !turn.chatPolicyHeld && !turn.interrupted;
}

export function pendingWorkChanges(root, chatId, changes = []) {
  const observed = new Map();
  return changes.filter(change => {
    if (!observed.has(change.turnId)) observed.set(change.turnId, readTurn(root, chatId, change.turnId));
    const turn = observed.get(change.turnId);
    return turn?.policy !== 'exclude' && !turn?.chatPolicyHeld &&
      !turn?.routeFacts?.workChanges.some(saved => saved.revision === change.revision);
  });
}

export function readBoundProject(root, chatId, startedAt, shared = snapshot(root, location(chatId), 'scope', chatId)) {
  // A later version of the binding is not evidence about the start of a turn.
  if (!shared.stat || !(shared.stat.mtimeMs <= Date.parse(startedAt))) return undefined;
  const ownership = shared.document?.values[CURRENT_WORK_KEY]?.ownership;
  if (ownership?.state !== 'bound' || ownership.target?.kind !== 'project') return undefined;
  validateOwnership(ownership);
  const target = ownership.target;
  const project = target.targetId ? targetRegistry(root).records.get(target.targetId) : target;
  if (project?.kind !== 'project' || project.lifecycle === 'planned') return undefined;
  const locator = { name: project.name, scope: project.scope };
  validateProject(locator);
  return locator;
}

export function readRouteSources(root, chatId, turnIds, observedTurn) {
  const byTurn = new Map();
  const requested = new Set(turnIds), issues = [];
  function fact(turnId) {
    if (!byTurn.has(turnId)) byTurn.set(turnId, { workChanges: [], abilityIds: [] });
    return byTurn.get(turnId);
  }
  try {
    const shared = snapshot(root, location(chatId), 'scope', chatId);
    for (const change of shared.document?.workChanges ?? []) if (requested.has(change.turnId)) fact(change.turnId).workChanges.push(change);
    if (observedTurn && requested.has(observedTurn.turnId)) {
      const project = readBoundProject(root, chatId, observedTurn.startedAt, shared);
      if (project) fact(observedTurn.turnId).startingProject = project;
      const pointer = shared.document?.workArrangement;
      if (pointer && pointer.turnId !== observedTurn.turnId && Date.parse(pointer.at) <= Date.parse(observedTurn.startedAt)) {
        const origin = readTurn(root, chatId, pointer.turnId);
        if (origin?.policy === 'capture' && origin.routeFacts?.workChanges.some(change =>
          change.revision === pointer.revision && change.at === pointer.at && change.arrangement)) {
          fact(observedTurn.turnId).startingArrangementRevision = pointer.revision;
        }
      }
    }
  } catch (error) { issues.push(error.code ?? 'CHAT_DATA_INVALID'); }
  try {
    const abilities = abilitySnapshots(root, chatId);
    for (const { objectId, before } of abilities.records) {
      for (const turnId of before.document.turnIds) if (requested.has(turnId)) fact(turnId).abilityIds.push(objectId);
    }
    for (const issue of abilities.issues) issues.push(issue.code);
  } catch (error) { issues.push(error.code ?? 'CHAT_DATA_INVALID'); }
  return { byTurn, issues: [...new Set(issues)] };
}

export function discardRestrictedWorkChanges(root, chatId, turnIds) {
  if (!turnIds.size) return;
  const path = location(chatId);
  const before = snapshot(root, path, 'scope', chatId);
  const restricted = document => document?.workChanges?.some(change => turnIds.has(change.turnId)) ||
    turnIds.has(document?.workArrangement?.turnId);
  if (!restricted(before.document)) return;
  locked(root, chatId, () => {
    const current = snapshot(root, path, 'scope', chatId), document = current.document;
    if (!restricted(document)) return;
    const keep = (document.workChanges ?? []).filter(change => !turnIds.has(change.turnId));
    const next = { ...document, revision: document.revision + 1 };
    if (keep.length) next.workChanges = keep;
    else delete next.workChanges;
    if (turnIds.has(next.workArrangement?.turnId)) delete next.workArrangement;
    publish(root, current, next, 'scope', chatId);
  });
}
