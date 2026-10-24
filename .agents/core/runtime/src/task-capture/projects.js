// Query projections only: archived declarations remain the source of truth.
import { ownershipOf, relatedOf } from '../routing/targets.js';
export const virtualProjects = { 'state:none': '无项目', 'state:unresolved': '待确定', unreported: '未上报', 'state:excluded': '未记录' };
export const projectKey = p => `${p.scope}:${p.name}`;
export const projectLabel = p => p.name + (p.scope === 'archived' ? '（已归档）' : '');
function primary(snapshot) {
  const ownership = ownershipOf(snapshot);
  if (ownership.state === 'bound' && (ownership.target.kind !== 'project' || ownership.target.lifecycle === 'planned')) return null;
  const p = ownership.state === 'bound' ? { state: 'bound', primary: ownership.target } : ownership;
  return p.state === 'bound' && p.primary ? { key: projectKey(p.primary), label: projectLabel(p.primary), project: p.primary }
    : { key: `state:${p.state}`, label: virtualProjects[`state:${p.state}`] ?? '待确定' };
}
export function turnProjects(turn) {
  const entries = new Map(), sequence = [];
  const add = (key, role, label, project) => {
    const old = entries.get(key);
    if (!old || role === 'primary') entries.set(key, { key, role, label, ...(project ? { project } : {}) });
  };
  if (turn.policy === 'exclude') add('state:excluded', 'excluded', '未记录');
  else if (!turn.routes.length) add('unreported', 'unreported', '未上报');
  else for (const event of turn.routes) {
    const p = primary(event.snapshot);
    if (p) {
      add(p.key, p.project ? 'primary' : ownershipOf(event.snapshot).state, p.label, p.project);
      if (sequence.at(-1)?.key !== p.key) sequence.push(p);
    }
    for (const ref of relatedOf(event.snapshot).filter(t => t.kind === 'project' && t.lifecycle !== 'planned')) add(projectKey(ref), 'reference', projectLabel(ref), ref);
  }
  return { entries: [...entries.values()], sequence, switched: sequence.length > 1 };
}
// References remain round evidence, but never create a chat's project ownership.
export const ownedProjects = turn => turnProjects(turn).entries.filter(entry => entry.role !== 'reference');
export function turnRelation(turn, key, history = turnProjects(turn)) {
  const match = history.entries.find(e => e.key === key);
  const last = history.sequence.at(-1);
  const kind = match?.role ?? (turn.policy === 'exclude' ? 'excluded' : !turn.routes.length ? 'unreported'
    : last?.key === 'state:none' ? 'none' : last?.key === 'state:unresolved' ? 'unresolved' : 'other');
  const label = { primary: '本项目', reference: '仅引用', other: `其他项目${last?.project ? ` · ${last.label}` : ''}`, none: '无项目', unresolved: '待确定', unreported: '未上报', excluded: '未记录' }[kind] ?? '待确定';
  return { kind, label, matches: !!match };
}
export function projectContext(all, key) {
  let latestReported = null, latestTurnId = null, turnCount = 0, primaryTurnCount = 0, referenceTurnCount = 0;
  all.forEach((turn, index) => {
    const entry = turnProjects(turn).entries.find(e => e.key === key);
    if (!entry) return;
    if (entry.role === 'reference') { referenceTurnCount++; return; }
    turnCount++; latestTurnId = turn.turnId;
    if (entry.role === 'primary') primaryTurnCount++;
    turn.routes.forEach(event => {
      const p = primary(event.snapshot);
      const matches = p?.key === key;
      if (matches && (!latestReported || event.at >= latestReported.reportedAt)) latestReported = {
        turnId: turn.turnId, turnNumber: index + 1, eventId: event.eventId, reportedAt: event.at, route: event.snapshot,
      };
    });
  });
  return { key, turnCount, primaryTurnCount, referenceTurnCount, latestTurnId, latestReported };
}
export function historyText(task, all) {
  return [task.title, ...all.flatMap(t => t.routes.flatMap(e => [e.snapshot.summary,
    e.snapshot.project.primary?.name, ...e.snapshot.references.map(p => p.name),
    ...e.snapshot.abilities.filter(a => !a.fixed).map(a => a.name)]))].filter(Boolean).join(' ').toLocaleLowerCase();
}
