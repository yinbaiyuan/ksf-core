// Legacy identities are accepted only when reading historical evidence or an
// explicit migration. Current object inputs always use the current schema.
export function currentObjectId(id) {
  return typeof id === 'string' ? id.replace(/^workflow\./, 'cooperation.')
    .replace(/^competency\.ksf\.workflow-design$/, 'competency.ksf.cooperation-design')
    .replace(/^partner\.ksf\.object-designer$/, 'partner.ksf.ability-manager') : id;
}

export function currentTargetKey(key) {
  return typeof key === 'string' ? key.replace(/^(ability:.*:)([^:]+)$/, (_, prefix, id) => prefix + currentObjectId(id)) : key;
}
export function currentReference(ref) {
  if (typeof ref !== 'string') return ref;
  const prefix = ['+', '#'].includes(ref[0]) ? ref[0] : '';
  const [id, ...version] = ref.slice(prefix.length).split('@');
  return prefix + [currentObjectId(id), ...version].join('@');
}
export function currentObjectPath(path) {
  if (typeof path !== 'string') return path;
  return path.replace(/(^|\/)工作流(?=\/|$)/g, '$1协同')
    .replace(/(^|\/)workflows(?=\/|$)/g, '$1cooperations')
    .replace(/(^|\/)workflow\.md$/g, '$1cooperation.md')
    .replace(/(^|\/)workflow\./g, '$1cooperation.')
    .replace(/(^|\/)workflow-design(?=\/|$)/g, '$1cooperation-design')
    .replace(/competency\.ksf\.workflow-design/g, 'competency.ksf.cooperation-design')
    .replace(/(^|\/)ksf-object-designer(?=\/|$)/g, '$1ability-manager')
    .replace(/partner\.ksf\.object-designer/g, 'partner.ksf.ability-manager');
}
