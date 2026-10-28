import { MetadataError } from '../metadata/errors.js';
import { migrateCooperation } from '../migrations/cooperation.js';
import { runObjectCommand } from './objects.js';

export function runCooperationCommand(args, root) {
  if (args[0] !== 'migrate') return runObjectCommand('cooperation', args, root);
  if (args.length === 2 && ['--help', '-h'].includes(args[1])) return { exitCode: 0, stdout: 'ksf cooperation migrate (--dry-run | --apply) [--json]\nExplicitly migrate legacy ability identities, source protocol and current state. Historical evidence is preserved.\n' };
  const result = { ok: false, command: 'cooperation', operation: 'migrate', data: null, errors: [] };
  let exitCode = 0;
  try {
    const options = args.slice(1), allowed = new Set(['--dry-run', '--apply', '--json']);
    if (new Set(options).size !== options.length || options.some(o => !allowed.has(o)) || options.includes('--apply') === options.includes('--dry-run')) throw new MetadataError('INVALID_ARGUMENTS', 'Specify exactly one of --dry-run or --apply, optionally --json.', { exitCode: 2 });
    result.data = migrateCooperation({ root, apply: options.includes('--apply') }); result.ok = true;
  } catch (error) {
    result.errors = [{ code: error.code ?? 'MIGRATION_FAILED', message: error.message, ...(error.details ?? {}) }]; exitCode = error.exitCode ?? 1;
  }
  return { exitCode, stdout: JSON.stringify(result, null, args.includes('--json') ? undefined : 2) + '\n' };
}
