import { existsSync, readFileSync, lstatSync } from 'node:fs';
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
  if (state.schemaVersion !== 1 || state.root !== root || !Array.isArray(state.actions) || !['applying', 'complete'].includes(state.status)) throw new MetadataError('MIGRATION_DATA_INVALID', 'Invalid migration journal; preserve it.');
  if (state.status !== 'complete') throw new MetadataError('MIGRATION_PENDING', 'Cooperation migration is incomplete. Resume with ksf cooperation migrate --apply.');
}
