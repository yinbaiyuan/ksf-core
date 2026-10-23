import { parseOptions, optionSpecs, hasJsonFlag } from '../shared/options.js';
import { MetadataError, invalid } from '../metadata/errors.js';
import { abilitySource } from '../services/sources.js';
import { validSourceId } from '../sources/schema.js';
import { parseReference, versionPattern } from '../objects/schema.js';

const usages = {
  init: 'init <repository-path> --id <source-id> --name <name> [--description <text>] [--dry-run]',
  link: 'link <repository-path> [--dry-run]', unlink: 'unlink <source-id> [--dry-run]',
  list: 'list', read: 'read <source-id>', check: 'check [<source-id> | --path <repository-path>]',
  export: 'export <source-id> <personal-id[@version]> [--versions <JSON>] [--dry-run]',
};
export function sourceHelp(operation) {
  return `KSF source${operation ? ' ' + operation : ''}\n\nUsage:\n` +
    Object.entries(usages).filter(([key]) => !operation || key === operation).map(([, usage]) => '  ksf source ' + usage + ' [--json]').join('\n') +
    '\n\nDirect associations only; reads use the current repository working tree, offline.\nGit clone/pull/commit/push/PR remain normal Git operations.\nexport prepares local files only; it does not commit, push or open a PR.\nPaths are relative to the KSF root; unlink preserves the repository.\n';
}
export function runSourceCommand(args, root) {
  const result = { ok: false, command: 'source', operation: Object.hasOwn(usages, args[0]) ? args[0] : null, data: null, errors: [] };
  let exitCode = 0;
  try {
    if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { stdout: sourceHelp(), exitCode: 0 };
    const [operation, ...rest] = args;
    if (!Object.hasOwn(usages, operation)) invalid('Unknown source operation.');
    const parsed = { root, operation, dryRun: false }, targets = [];
    const allowed = ['json', 'help', ...(['init', 'link', 'unlink', 'export'].includes(operation) ? ['dry-run'] : []), ...(operation === 'init' ? ['id', 'name', 'description'] : []), ...(operation === 'check' ? ['path'] : []), ...(operation === 'export' ? ['versions'] : [])];
    const seen = parseOptions(rest, { result: parsed, options: optionSpecs(allowed), invalid, target: token => targets.push(token) });
    if (parsed.help) { if (seen.size !== 1 || targets.length) invalid('Use --help alone.'); return { stdout: sourceHelp(operation), exitCode: 0 }; }
    const count = operation === 'list' ? 0 : operation === 'check' ? (parsed.path === undefined ? targets.length : 0) : operation === 'export' ? 2 : 1;
    if (targets.length !== count || (operation === 'check' && targets.length > 1)) invalid('Invalid source targets.');
    if (targets.some(value => !value.trim() || /[\x00-\x1f\x7f]/.test(value)) || (parsed.path !== undefined && (!parsed.path.trim() || /[\x00-\x1f\x7f]/.test(parsed.path)))) invalid('Source targets and paths must be nonempty, ordinary strings.');
    parsed.target = targets[0];
    if (['read', 'unlink', 'export'].includes(operation) || (operation === 'check' && parsed.target)) if (!validSourceId(parsed.target)) invalid('Expected a source ID.');
    if (operation === 'init' && (!validSourceId(parsed.id) || !parsed.name?.trim())) invalid('init requires --id and --name.');
    if (operation === 'export') { parseReference(targets[1]); parsed.reference = targets[1]; }
    if (parsed.versions !== undefined) {
      try { parsed.versions = JSON.parse(parsed.versions); } catch { invalid('--versions requires a JSON object.'); }
      if (!parsed.versions || typeof parsed.versions !== 'object' || Array.isArray(parsed.versions)) invalid('--versions requires an object-ID to exact-version mapping.');
      for (const [id, version] of Object.entries(parsed.versions)) if (parseReference(id).version !== undefined || typeof version !== 'string' || !versionPattern.test(version)) invalid('Invalid publication version mapping.');
    }
    if (parsed.path !== undefined) parsed.reference = parsed.path;
    const response = abilitySource(parsed);
    result.data = response.data; result.errors = response.errors; result.ok = !result.errors.length; exitCode = result.ok ? 0 : 1;
  } catch (error) {
    result.data = error.details?.data ?? null;
    const { data, errors, ...details } = error.details ?? {};
    result.errors = [{ code: error.code ?? 'SOURCE_OPERATION_FAILED', message: error instanceof MetadataError || error.code ? error.message : 'Ability-source operation failed.', ...details }, ...(errors ?? [])];
    exitCode = error.exitCode ?? 1;
  }
  return { stdout: hasJsonFlag(args) ? JSON.stringify(result) + '\n' : JSON.stringify(result, null, 2) + '\n', exitCode };
}
