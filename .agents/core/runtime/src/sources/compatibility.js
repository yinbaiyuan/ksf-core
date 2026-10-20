import { configuredSources } from './storage.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { catalog } from '../objects/catalog.js';
import { problems, referenceResults } from '../objects/references.js';
import { sourceFailure } from './schema.js';

export function checkSourceCompatibility(root, candidate) {
  const entries = configuredSources(root);
  if (!entries.length) return;
  // Pre-source Core releases can satisfy old object versions while silently
  // ignoring every association. Require the v1 reader and command support too.
  for (const module of ['sources/schema.js', 'commands/sources.js']) {
    if (!existsSync(join(candidate, '.agents/core/runtime/src', module))) sourceFailure('SOURCE_CORE_INCOMPATIBLE', 'Candidate Core does not support linked ability sources; explicitly unlink them before returning to a pre-source release.');
  }
  const c = catalog(candidate, { linked: false, extraSources: entries }), errors = [];
  for (const entry of entries) errors.push(...problems(c, { source: entry.id }));
  for (const row of c.rows.filter(row => row.sourceRoot && !row.errors.length && row.metadata.status !== 'archived')) {
    errors.push(...referenceResults(c, row).filter(ref => ref.error).map(ref => ({ ...ref.error, source: row.source })));
  }
  if (errors.length) sourceFailure('SOURCE_CORE_INCOMPATIBLE', 'Candidate Core does not satisfy the linked ability sources; current repositories and Core were preserved.', { errors });
}
