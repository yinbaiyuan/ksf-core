import { parseOptions, optionSpecs, hasJsonFlag } from '../shared/options.js';
import { resolve } from 'node:path';
import { MetadataError, decodeUtf8, invalid } from '../metadata/errors.js';
import { readSnapshot } from '../metadata/files.js';
import { types, parseReference } from '../objects/schema.js';
import { validSourceId } from '../sources/schema.js';
import { parseObjectInput, objectQuery, objectMutation } from '../services/objects.js';

const operations = new Set(['list', 'read', 'write', 'remove', 'check']);
const allowed = {
  list: ['source', 'json', 'help'],
  read: ['source', 'part', 'json', 'help'],
  check: ['source', 'json', 'help'],
  write: ['data', 'from', 'dry-run', 'json', 'help'],
  remove: ['dry-run', 'json', 'help'],
};

export function objectHelp(type, operation) {
  const lines = {
    list: 'list [--source effective|system|user|all|source-id] [--json]',
    read: 'read <id[@version]> [--part metadata|body|all] [--source effective|system|user|source-id] [--json]',
    check: 'check <id[@version]> [--source effective|system|user|source-id] [--json]',
    write: 'write <id> (--data <JSON> | --from <file>) [--dry-run] [--json]',
    remove: 'remove <id> [--dry-run] [--json]',
  };
  return `KSF ${type}${operation ? ` ${operation}` : ''}\n\nUsage:\n` +
    (operation ? [lines[operation]] : Object.values(lines)).map(line => `  ksf ${type} ${line}`).join('\n') + '\n\n' +
    'Defaults: --source effective; read --part all. --help or -h shows help.\n' +
    'write input: {"metadata":{...},"body":"..."}; omitted parts are retained.\n' +
    'Writes only affect user objects. A system object is derived as a whole directory.\n' +
    'user_revision and upstream are service-managed fields.\n' +
    'draft/active user objects take over; archived user objects do not.\n' +
    'Exact versions: matching user, unique linked source, then system.\n' +
    'remove physically deletes the complete user directory, including baseline and assets.\n' +
    '--from paths are based on the KSF root. --dry-run does not publish changes.\n';
}

export function parseObjectArgs(type, args) {
  if (!Object.hasOwn(types, type)) invalid('Unknown object type.');
  if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { help: true };
  const [operation, ...rest] = args;
  if (!operations.has(operation)) invalid('Expected list, read, write, remove or check.');
  const parsed = { operation, source: 'effective', part: 'all', dryRun: false };
  const setTarget = token => {
    if (parsed.reference !== undefined || operation === 'list') invalid('Unexpected object argument.');
    parsed.reference = token;
  };
  const seen = parseOptions(rest, { result: parsed, invalid, target: setTarget,
    options: optionSpecs(allowed[operation]),
    messages: { unknown: 'Unknown object option.', unsupported: name => `Option --${name} is not supported by ${operation}.` },
  });
  if (parsed.help) {
    if (seen.size !== 1 || parsed.reference !== undefined) invalid('Use --help without target or other options.');
    return parsed;
  }
  if (operation !== 'list') {
    const reference = parseReference(parsed.reference, type);
    if (['write', 'remove'].includes(operation) && reference.version) invalid('write/remove require a plain ID.');
  }
  if (!['effective', 'system', 'user', ...(operation === 'list' ? ['all'] : [])].includes(parsed.source) && !validSourceId(parsed.source)) invalid('Invalid source selection.');
  if (!['metadata', 'body', 'all'].includes(parsed.part)) invalid('Invalid read part.');
  if (operation === 'write' && seen.has('data') === seen.has('from')) invalid('Specify exactly one of --data or --from.');
  return parsed;
}

function render(result) {
  const lines = [];
  if (result.data) lines.push(JSON.stringify(result.data, null, 2));
  for (const error of result.errors) lines.push(`${error.code}: ${error.message}`);
  return lines.join('\n') + '\n';
}

export function runObjectCommand(type, args, root) {
  const json = hasJsonFlag(args);
  let parsed;
  const result = { ok: false, command: type, operation: operations.has(args[0]) ? args[0] : null, data: null, errors: [] };
  let exitCode = 0;
  try {
    parsed = parseObjectArgs(type, args);
    if (parsed.help) return { stdout: objectHelp(type, parsed.operation), exitCode: 0 };
    let response;
    if (['write', 'remove'].includes(parsed.operation)) {
      let input;
      if (parsed.operation === 'write') {
        const path = parsed.from === undefined ? undefined : resolve(root, parsed.from);
        const text = path ? decodeUtf8(readSnapshot(path).bytes, path) : parsed.data;
        input = parseObjectInput(text, path);
      }
      response = objectMutation({ ...parsed, type, id: parsed.reference, root, input });
    } else response = objectQuery({ ...parsed, type, root });
    result.data = response.data; result.errors = response.errors; result.ok = result.errors.length === 0;
    exitCode = result.ok ? 0 : 1;
  } catch (failure) {
    const error = failure instanceof MetadataError ? failure : new MetadataError('OBJECT_OPERATION_FAILED', 'Object operation failed.');
    const { data, errors, ...details } = error.details;
    result.data = data ?? (parsed?.reference ? { id: parsed.reference, ...(['write', 'remove'].includes(parsed.operation) ? { dryRun: parsed.dryRun, changed: false } : {}) } : null);
    result.errors = [{ code: error.code, message: error.message, ...details }, ...(errors ?? [])];
    exitCode = error.exitCode;
  }
  return { stdout: json ? JSON.stringify(result) + '\n' : render(result), exitCode };
}
