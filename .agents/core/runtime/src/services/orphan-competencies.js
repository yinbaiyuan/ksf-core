import {catalog, summary} from '../objects/catalog.js';
import {resolveObject, referenceResults, problems} from '../objects/references.js';
import {protectedPaths, fail} from '../objects/schema.js';

const identity = row => JSON.stringify([row.source, row.id, row.metadata.version, row.path, row.digest]);
const support = new Set(['competency.ksf.orphan-competency-match']);

// Compute the current positive graph. Never persist reverse associations.
export function orphanCompetencies(root, {source} = {}) {
  const c = catalog(root, {sourceFilter:source}), errors = problems(c).filter(e => !e.type || ['partner','competency'].includes(e.type));
  if (source && !c.sources.some(s => s.id === source)) fail('INVALID_ARGUMENTS', 'Unknown linked ability source.', {source, exitCode:2});
  const effective = type => {
    const rows = [];
    for (const id of new Set(c.rows.filter(r => r.type === type && r.id).map(r => r.id))) {
      try { rows.push(resolveObject(c, {id})); }
      catch (e) { if (e.code !== 'OBJECT_NOT_FOUND') errors.push({code:e.code,message:e.message,id,...e.details}); }
    }
    return rows;
  };
  const partners = effective('partner'), competencies = effective('competency'), associated = new Set();
  const references = new Map();
  function edges(row) {
    const key = identity(row);
    if (references.has(key)) return references.get(key);
    const result = referenceResults(c,row), targets = [];
    for (const r of result) {
      if (r.error) { errors.push({...r.error,source:row.source}); continue; }
      const target = c.rows.find(t => t.source === r.source && t.path === r.path && t.id === r.id && t.metadata.version === r.version);
      if (target) targets.push(target);
      else errors.push({code:'OBJECT_GRAPH_INCOMPLETE',message:'Resolved dependency is unavailable.',id:r.id,target:r.path});
    }
    const value = {targets,valid:targets.length === result.length};
    references.set(key,value); return value;
  }
  const visited = new Set();
  function visit(row) {
    const key=identity(row); if (visited.has(key)) return;
    visited.add(key); if (row.type === 'competency') associated.add(key);
    for (const target of edges(row).targets) visit(target);
  }
  partners.forEach(visit);
  function usable(row, seen = new Set()) {
    const key=identity(row); if (seen.has(key)) return true;
    seen.add(key); const e=edges(row);
    return e.valid && e.targets.every(t => usable(t,seen));
  }
  const objects = competencies.filter(r => !Object.hasOwn(protectedPaths,r.id) && !support.has(r.id) && !associated.has(identity(r)) && usable(r))
    .sort((a,b) => a.id.localeCompare(b.id,'en')).map(r => ({...summary(r),definition_digest:r.digest}));
  const unique = [...new Map(errors.map(e => [JSON.stringify(e),e])).values()];
  return {data:{complete:unique.length===0,objects},errors:unique};
}
