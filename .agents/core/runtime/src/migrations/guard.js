import { existsSync, readFileSync, lstatSync, realpathSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { MetadataError } from '../metadata/errors.js';

export function assertNoCooperationMigration(root) {
  root = resolve(root);
  const file = join(root, '.agents/runtime-data/cooperation-migration/state.json');
  let current = root;
  for (const part of relative(root, file).split(/[\\/]/)) {
    current = join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) throw new MetadataError('MIGRATION_DATA_INVALID', 'Migration journal path cannot contain symbolic links.'); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
  }
  if (!existsSync(file)) return;
  let state;
  try { if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) throw new Error(); state = JSON.parse(readFileSync(file, 'utf8')); }
  catch { throw new MetadataError('MIGRATION_DATA_INVALID', 'Invalid migration journal; preserve it.'); }
  if (state?.schemaVersion !== 1 || typeof state.root !== 'string' || !Array.isArray(state.actions) || !['applying', 'complete'].includes(state.status)) throw new MetadataError('MIGRATION_DATA_INVALID', 'Invalid migration journal; preserve it.');
  // A completed journal is history. Moving or renaming the instance must not turn it into a gate.
  if (state.status === 'complete') return;
  // The journal records realpath(root); compare the same form so a symlinked entry path is not a move.
  assertJournalRoot(state.root, realpathSync(root));
  throw new MetadataError('MIGRATION_PENDING', 'Cooperation migration is incomplete. Resume with ksf cooperation migrate --apply.');
}

// An unfinished journal holds absolute paths, so it may only resume at the root that started it.
export function assertJournalRoot(recorded, root) {
  if (recorded === root) return;
  throw new MetadataError('INSTANCE_ROOT_MOVED', `An unfinished cooperation migration was started at ${recorded}; this instance is now at ${root}. Move the instance back to the original path and run ksf cooperation migrate --apply, then move it again. The journal was preserved.`, { recordedRoot: recorded, currentRoot: root });
}
