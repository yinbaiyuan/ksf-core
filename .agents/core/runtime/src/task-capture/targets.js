import { ownershipOf, relatedOf, targetKey, targetLabel } from '../routing/targets.js';
import { currentTargetKey } from '../objects/legacy.js';
const storedKey = target => currentTargetKey(targetKey(target));

export const virtualTargets = { 'state:none': '无归属', 'state:unresolved': '待确定', 'state:dialogue': '对话轮次', unreported: '未上报', 'state:excluded': '未记录' };
export function workTargets(turn) {
  return (turn.routeFacts?.workChanges ?? []).flatMap(({ project, projectChanged }) =>
    project && projectChanged !== false ? [{ key: storedKey(project), label: targetLabel(project), target: project }] : []);
}
export function primaryTarget(route) {
  const ownership = ownershipOf(route);
  return ownership.state === 'bound' ? { key: storedKey(ownership.target), label: targetLabel(ownership.target), target: ownership.target }
    : { key: `state:${ownership.state}`, label: virtualTargets[`state:${ownership.state}`] };
}
export function turnTargets(turn) {
  const entries = new Map(), sequence = [];
  const add = e => { if (!entries.has(e.key) || e.role === 'primary') entries.set(e.key, e); };
  if (turn.policy === 'exclude') add({ key: 'state:excluded', role: 'excluded', label: '未记录' });
  else if (!turn.routes.length) add(turn.routeFacts
    ? { key: 'state:dialogue', role: 'dialogue', label: virtualTargets['state:dialogue'] }
    : { key: 'unreported', role: 'unreported', label: virtualTargets.unreported });
  else for (const event of turn.routes) {
    const p = primaryTarget(event.snapshot);
    add({ ...p, role: p.target ? 'primary' : p.key.slice(6) });
    if (sequence.at(-1)?.key !== p.key) sequence.push(p);
    for (const target of relatedOf(event.snapshot)) add({ key: storedKey(target), role: 'related', label: targetLabel(target), target });
  }
  return { entries: [...entries.values()], sequence, switched: sequence.length > 1 };
}
export const ownedTargets = turn => turnTargets(turn).entries.filter(e => e.role !== 'related');
export function targetRelation(turn, key, history = turnTargets(turn)) {
  const match = history.entries.find(e => e.key === key), last = history.sequence.at(-1);
  const arrangement = workTargets(turn).some(entry => entry.key === key);
  const kind = match?.role ?? (turn.policy === 'exclude' ? 'excluded' : arrangement ? 'arrangement' : !turn.routes.length ? (turn.routeFacts ? 'dialogue' : 'unreported')
    : last?.key === 'state:none' ? 'none' : last?.key === 'state:unresolved' ? 'unresolved' : 'other');
  const label = { primary: ({ project: '本项目', knowledge: '本知识单元', ability: '本能力', archive: '本档案', inbox: '本收件', persona: '本人设' }[match?.target?.kind] ?? '本目标'), related: '仅关联', other: `其他归属${last?.target ? ` · ${last.label}` : ''}`, none: '无归属', unresolved: '待确定', dialogue: '对话轮次', arrangement: '工作安排', unreported: '未上报', excluded: '未记录' }[kind] ?? '待确定';
  return { kind, label, matches: !!match || arrangement };
}
export function targetContext(all, key) {
  let latestReported = null, latestTurnId = null, arrangementTurnId = null, turnCount = 0, relatedTurnCount = 0;
  all.forEach((turn, index) => {
    if (workTargets(turn).some(e => e.key === key)) arrangementTurnId = turn.turnId;
    const entry = turnTargets(turn).entries.find(e => e.key === key);
    if (!entry) return;
    if (entry.role === 'related') { relatedTurnCount++; return; }
    turnCount++; latestTurnId = turn.turnId;
    for (const event of turn.routes) if (primaryTarget(event.snapshot).key === key && (!latestReported || event.at >= latestReported.reportedAt)) latestReported = {
      turnId: turn.turnId, turnNumber: index + 1, eventId: event.eventId, reportedAt: event.at, route: event.snapshot,
    };
  });
  return { key, turnCount, relatedTurnCount, latestTurnId, latestReported, ...(arrangementTurnId ? { arrangementTurnId } : {}) };
}
export function targetHistoryText(task, all) {
  return [task.title, ...all.flatMap(turn => workTargets(turn).map(entry => entry.label)), ...all.flatMap(t => t.routes.flatMap(e => [e.snapshot.summary,
    ownershipOf(e.snapshot).target?.name, ...relatedOf(e.snapshot).map(t => t.name),
    ...e.snapshot.abilities.filter(a => !a.fixed).map(a => a.name)]))].filter(Boolean).join(' ').toLocaleLowerCase();
}
