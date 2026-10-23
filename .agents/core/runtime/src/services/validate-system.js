import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Use the candidate's own schema: rollback must also accept a valid older entry
// identity. Only system definitions participate; user overrides stay in place.
export async function validateSystemDefinitions(root) {
  const source = relative => pathToFileURL(join(root, '.agents/core/runtime/src', relative)).href;
  const [{ catalog, problems, resolveObject }, { protectedPaths }] = await Promise.all([
    import(source('objects/catalog.js')), import(source('objects/schema.js')),
  ]);
  const c = catalog(root, { linked: false }), errors = problems(c, { source: 'system' });
  for (const id of Object.keys(protectedPaths)) {
    try {
      const row = resolveObject(c, { id }, 'system');
      if (row.metadata.status !== 'active') errors.push({ id, code: 'SYSTEM_ENTRY_INACTIVE' });
    } catch (error) { errors.push({ id, code: error.code }); }
  }
  for (const row of c.rows.filter(row => row.source === 'system' && !row.errors.length)) {
    for (const reference of row.metadata.references ?? []) {
      const [id, version] = reference.split('@');
      try {
        const target = resolveObject(c, { id, version }, 'system');
        if (target.metadata.status === 'archived') errors.push({ id: row.id, reference, code: 'SYSTEM_REFERENCE_ARCHIVED' });
      } catch (error) { errors.push({ id: row.id, reference, code: error.code }); }
    }
  }
  if (errors.length) throw Object.assign(new Error('System definitions or exact references are invalid.'), { code: 'SYSTEM_DEFINITIONS_INVALID', errors });
  return { valid: true, objects: c.rows.filter(row => row.source === 'system').length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(JSON.stringify(await validateSystemDefinitions(resolve(process.argv[2]))) + '\n'); }
  catch (error) {
    process.stderr.write(JSON.stringify({ code: error.code ?? 'SYSTEM_DEFINITIONS_INVALID', errors: error.errors ?? [] }) + '\n');
    process.exitCode = 1;
  }
}
