import {parseFrontmatter} from '../metadata/frontmatter.js';
import {objectQuery} from './objects.js';

// Entry selects the root; its references own all further definition loading.
// Profile reads and other business actions remain with the loaded competencies.
export function collaborationContext(root, entry) {
  const items = [{key:'runtime', source:entry.source, path:entry.path, state:'present', version:entry.version, sha256:entry.sha256, contentRef:'entry.content'}];
  const errors = []; let expanded;
  try {
    const metadata = parseFrontmatter(Buffer.from(entry.content), entry.path).values;
    const result = objectQuery({root, type:metadata.id.split('.')[0], operation:'read', reference:metadata.id+'@'+entry.version, source:entry.source, part:'all'});
    errors.push(...result.errors);
    if (result.data.object.definition_digest !== entry.sha256) {
      throw Object.assign(new Error('Entry definition changed while assembling context.'), {code:'CONTEXT_DEFINITION_CHANGED'});
    }
    expanded = result.data.expanded;
  } catch (error) {
    errors.push({code:error.code ?? 'CONTEXT_READ_FAILED', message:error.message, target:entry.path});
  }
  return {protocol:'ksf-entry-context-v3', complete:errors.length === 0, items, ...(expanded ? {expanded} : {}), errors};
}
