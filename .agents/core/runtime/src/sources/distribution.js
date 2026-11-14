import {resolveDependency} from '../objects/references.js';
import {fail} from '../objects/schema.js';

// Distribution entries are a source's public products. Definitions retain their
// own IDs/versions; exact references determine what ships with each entry.
export function annotateDistribution(c, sourceId, entries) {
  if (!entries) return c;
  const rows = c.rows.filter(r => r.source === sourceId && !r.errors.length);
  const byId = new Map(rows.map(r => [r.id, r])), closures = new Map();
  for (const id of entries) {
    const entry = byId.get(id);
    if (!entry || entry.metadata.status === 'archived') fail('SOURCE_DISTRIBUTION_INVALID', '发布入口不存在或已归档：' + id);
    const selected = new Map();
    const visit = row => {
      if (selected.has(row.id)) return;
      selected.set(row.id, row);
      for (const ref of row.metadata.references ?? []) {
        // Source inspection reports invalid references. Deriving presentation
        // metadata must not make an unrelated broken entry block selection.
        try {
          const dep = resolveDependency(c, row, ref);
          if (dep.kind !== 'file' && dep.target.source === sourceId) visit(dep.target);
        } catch { /* Actual pack/install still resolves every selected reference. */ }
      }
    };
    visit(entry); closures.set(id, selected);
  }
  for (const row of rows) row.distribution = {
    entry: entries.includes(row.id),
    owners: [...closures].filter(([, closure]) => closure.has(row.id)).map(([id]) => id),
    ...(closures.has(row.id) ? {members: [...closures.get(row.id).values()].filter(r => r.id !== row.id)
      .map(r => ({id: r.id, name: r.metadata.name, type: r.type, version: r.metadata.version}))} : {})
  };
  return c;
}

export const distributionOf = row => row.distribution ?? row.releaseObject?.distribution;
export function requireDistributionEntry(row) {
  const d = distributionOf(row);
  if (d?.entry === false) fail('ABILITY_STORE_BUNDLED_MEMBER', '此能力随发布入口整体交付，请选择：' + (d.owners.join('、') || '所属搭档'), {id: row.id, owners: d.owners});
}

// Legacy stores installed every definition explicitly. Demote a member only
// when another retained root actually keeps its exact dependency closure.
export function normalizeDistributionRoots(roots, objects) {
  const byId = new Map(objects.map(o => [o.id, o]));
  const reaches = (root, id, seen = new Set()) => {
    if (seen.has(root)) return false;
    seen.add(root);
    return (byId.get(root)?.dependencies ?? []).some(d => d.source !== 'system' && (d.id === id || reaches(d.id, id, seen)));
  };
  return roots.filter(id => byId.get(id)?.distribution?.entry !== false ||
    !roots.some(root => root !== id && byId.get(root)?.distribution?.entry === true && reaches(root, id)));
}

export function distributionRequests(ids, objects) {
  const byId = new Map(objects.map(o => [o.id, o]));
  return [...new Set(ids.flatMap(id => {
    const d = byId.get(id)?.distribution;
    const owners = d?.entry === false ? d.owners.filter(owner => byId.has(owner)) : [];
    return owners.length ? owners : [id];
  }))];
}
