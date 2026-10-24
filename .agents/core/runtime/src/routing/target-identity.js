export const targetKey = t => t.targetId ? `target:${t.targetId}` : t.kind === 'project' ? `${t.scope}:${t.name}` : t.kind === 'ability' ? `ability:${t.source}:${t.id}` : `${t.kind}:${t.path}`;
export const physicalTargetKey = t => targetKey(Object.fromEntries(Object.entries(t).filter(([key]) => key !== 'targetId')));
export const targetLabel = t => t.name + (t.kind === 'project' && t.scope === 'archived' ? '（已归档）' : '');
export const targetKinds = ['project', 'knowledge', 'ability', 'archive'];
