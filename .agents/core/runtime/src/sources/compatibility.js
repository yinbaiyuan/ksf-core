import {readStore,installedScopes} from '../ability-store/storage.js';
import { configuredSources } from './storage.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { catalog } from '../objects/catalog.js';
import { problems, referenceResults } from '../objects/references.js';
import { sourceFailure } from './schema.js';

export function checkSourceCompatibility(root, candidate) {
  const record=readStore(root);
  const entries = [...configuredSources(root).filter(s=>!record.state.adopted.includes(s.id)),...installedScopes(root,record)];
  if(Object.keys(record.state.installed).length&&!existsSync(join(candidate,'.agents/core/runtime/src/ability-store/storage.js')))sourceFailure('SOURCE_CORE_INCOMPATIBLE','目标Core不支持已安装能力，请保留当前Core。');
  if(record.version!=='missing'&&record.state.sources.some(s=>s.kind==='http')&&!existsSync(join(candidate,'.agents/core/runtime/src/ability-store/http.js')))sourceFailure('SOURCE_CORE_INCOMPATIBLE','目标Core不支持HTTP能力源状态，请保留当前Core。');
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
