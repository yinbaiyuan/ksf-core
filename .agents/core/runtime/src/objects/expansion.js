import { protectedPaths, parseDependencyReference } from './schema.js';
import { referenceResults, resolveDependency } from './references.js';
import { readReferencedFile } from './file-references.js';
import { fileReferenceView } from './file-locations.js';
import { parseFrontmatter } from '../metadata/frontmatter.js';

export function definitionView(row, part) {
  const result = { id: row.id, source: row.source, path: row.path, directory: row.directory,
    ...(row.sourceRoot ? { source_root: row.sourceRoot } : {}),
    version: row.metadata.version, user_revision: row.metadata.user_revision ?? null, definition_digest: row.digest,
    protected: Object.hasOwn(protectedPaths, row.id) };
  if (part !== 'body') result.metadata = row.metadata;
  if (part !== 'metadata') result.body = row.parsed.body.toString('utf8');
  return result;
}

const location = row => JSON.stringify([row.source, row.id, row.metadata?.version ?? row.version, row.path]);
const identity = row => JSON.stringify([location(row), row.digest]);

// Reading a shallow node and traversing a recursive node are separate facts.
// An explicit stack preserves declaration order without consuming the JS stack.
export function expandDefinitions(c, row, part, references) {
  if (part === 'metadata' || !(row.metadata.references ?? []).some(r => parseDependencyReference(r).expansion !== 'none')) return null;
  const expanded = [], errors = [], returned = new Set([identity(row)]), traversed = new Set([identity(row)]);
  const rows = new Map(c.rows.filter(r => r.metadata).map(r => [location(r), r]));
  const pending = references.map(reference => ({owner:row,reference})).reverse(), files = new Map();
  const problem = (error,target) => ({code:error.code ?? 'FILE_REFERENCE_READ_FAILED',message:error.message,target,...error.details});
  while (pending.length) {
    const {owner,reference} = pending.pop();
    // The caller reports root errors; recursive errors are recorded when queued.
    if (reference.error || !reference.expansion) continue;
    let target, key;
    if (reference.kind === 'file') {
      let file;
      try { file = resolveDependency(c,owner,reference.reference).target; }
      catch(error) { errors.push(problem(error,owner.path)); continue; }
      const cacheKey = JSON.stringify([file.source,file.target]);
      if (!files.has(cacheKey)) {
        try { files.set(cacheKey,readReferencedFile(file)); }
        catch(error) { files.set(cacheKey,{view:fileReferenceView(file,{state:'unavailable'}),bytes:null,error:problem(error,file.path)}); }
      }
      const result = files.get(cacheKey), view = result.view;
      key = JSON.stringify(['file',file.source,result.canonicalTarget ?? file.target,view.sha256,view.state]);
      if (!returned.has(key)) {
        returned.add(key);
        expanded.push({reference:reference.reference,kind:'file',file:view});
        if (result.error) errors.push(result.error);
      }
      if (reference.expansion !== 'recursive' || traversed.has(key) || view.state !== 'present') continue;
      traversed.add(key);
      try {
        const metadata = parseFrontmatter(result.bytes,file.path).values;
        if (metadata.references !== undefined && !Array.isArray(metadata.references)) throw Object.assign(new Error('File references must be an array.'),{code:'FILE_REFERENCE_METADATA_INVALID'});
        target = {source:file.source,...(file.sourceRoot?{sourceRoot:file.sourceRoot}:{}),path:file.path,directory:file.directory,metadata};
      } catch(error) { errors.push(problem(error,file.path)); continue; }
    } else {
      target = rows.get(location(reference));
      if (!target) {
        errors.push({ code: 'OBJECT_GRAPH_INCOMPLETE', message: 'Resolved expansion is unavailable.', id: reference.id, target: reference.path });
        continue;
      }
      key = identity(target);
      if (!returned.has(key)) {
        returned.add(key);
        expanded.push({ reference: reference.reference, object: definitionView(target, part) });
      }
      if (reference.expansion !== 'recursive' || traversed.has(key)) continue;
      traversed.add(key);
    }
    const children = referenceResults(c, target);
    errors.push(...children.filter(r => r.error).map(r => r.error));
    pending.push(...children.map(reference => ({owner:target,reference})).reverse());
  }
  return { expanded, errors: [...new Map(errors.map(e => [JSON.stringify(e), e])).values()] };
}
