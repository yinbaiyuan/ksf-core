import {readConfigFile} from '../configuration/storage.js';
import {parseFrontmatter} from '../metadata/frontmatter.js';

// Stable input assembly only. The runtime owns adoption and authorization.
export function collaborationContext(root, entry) {
  const items = [], errors = [];
  function load(key, path, source, definition = false) {
    try {
      const file = readConfigFile(root, path, {text:true});
      if (file.state === 'missing' && definition) throw Object.assign(new Error(`Missing fixed definition: ${path}`), {code:'ENTRY_DEFINITION_MISSING'});
      const metadata = definition ? parseFrontmatter(Buffer.from(file.document), path).values : null;
      const version = metadata?.version ?? null;
      if (definition && (!/^\d+\.\d+\.\d+$/.test(version ?? '') || !file.document.trim())) throw Object.assign(new Error(`Invalid fixed definition: ${path}`), {code:'ENTRY_DEFINITION_INVALID'});
      if (definition && (metadata.id !== `competency.ksf.${key}` || metadata.status !== 'active')) throw Object.assign(new Error(`Wrong fixed identity or status: ${path}`), {code:'ENTRY_DEFINITION_INVALID'});
      const expected = definition ? parseFrontmatter(Buffer.from(entry.content),entry.path).values.references?.find(r=>r.split('@')[0]===metadata.id)?.split('@')[1] : null;
      if (expected && expected !== version) throw Object.assign(new Error(`Fixed reference version mismatch: ${path}`), {code:'OBJECT_VERSION_MISMATCH'});
      items.push({key, source, path, state:file.state, version, sha256:file.etag, content:file.document});
    } catch (error) {
      errors.push({code:error.code ?? 'CONTEXT_READ_FAILED', message:error.message, target:path});
      items.push({key, source, path, state:'unavailable', version:null, sha256:null, content:null});
    }
  }
  load('user', 'USER.md', 'user');
  load('bot', 'BOT.md', 'user');
  // Keep data.entry byte-for-byte and include its body only once on the wire.
  items.push({key:'runtime', source:entry.source, path:entry.path, state:'present', version:entry.version, sha256:entry.sha256, contentRef:'entry.content'});
  load('ability-route', '.agents/core/abilities/competencies/ability-route/competency.md', 'system', true);
  load('project-route', '.agents/core/abilities/competencies/project-route/competency.md', 'system', true);
  return {protocol:'ksf-entry-context-v1', complete:errors.length === 0, items, errors};
}
