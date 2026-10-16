import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readUserData, writeUserData, removeUserData, checkUserData, listUserData, UserDataError } from '../services/user-data.js';
import { namespaces } from '../user-data/schema.js';

const operations = new Set(['list', 'read', 'write', 'remove', 'check']);
const specs = {
  list: ['json', 'help'], read: ['json', 'help'], check: ['json', 'help'],
  write: ['data', 'from', 'if-match', 'dry-run', 'json', 'help'],
  remove: ['if-match', 'dry-run', 'json', 'help'],
};
const invalid = message => { throw new UserDataError('INVALID_ARGUMENTS', message, {}, 2); };
export function userDataHelp(operation) {
  const usages = {
    list: 'list [--json]', read: 'read <namespace> [--json]', check: 'check <namespace> [--json]',
    write: 'write <namespace> (--data <JSON> | --from <file>) --if-match <etag|missing> [--dry-run] [--json]',
    remove: 'remove <namespace> --if-match <etag|missing> [--dry-run] [--json]',
  };
  const lines = operation ? [usages[operation]] : Object.values(usages);
  return `KSF user-data${operation ? ` ${operation}` : ''}\n\nUsage:\n${lines.map(line => `  ksf user-data ${line}`).join('\n')}\n\n` +
    `Only registered system-user-data namespaces are accepted; currently: ${Object.keys(namespaces).join(', ')}.\n` +
    'identity accepts name, email and namespace as local values; no account or global uniqueness verification.\n' +
    'Ordinary work, projects, knowledge, drafts and task checkpoints keep their existing locations.\n' +
    'write merges supplied top-level fields; each field value replaces its previous value.\n' +
    '--data/--from contains the values object, not the persisted envelope. --from is based on the KSF root.\n' +
    'Mutations require the exact etag from read, or missing to create an absent namespace.\n' +
    '--dry-run writes neither portable user data nor local locks. -- ends option parsing.\n' +
    'Use --help or -h alone at command or operation level.\n';
}
export function parseUserDataArgs(args) {
  if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { help: true };
  const [operation, ...rest] = args;
  if (!operations.has(operation)) invalid('Expected user-data list, read, write, remove or check.');
  const parsed = { operation }, seen = new Set(); let ended = false;
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (!ended && token === '--') { ended = true; continue; }
    if (ended || !token.startsWith('-')) {
      if (parsed.namespace !== undefined) invalid('Only one namespace is allowed.');
      parsed.namespace = token; continue;
    }
    const match = /^(?:--([a-z][a-z-]*)(?:=(.*))?|-([h]))$/s.exec(token);
    if (!match) invalid('Unknown user-data option.');
    const name = match[1] ?? 'help', inline = match[2];
    if (!specs[operation].includes(name) || seen.has(name)) invalid(`Unsupported or repeated option --${name}.`);
    seen.add(name);
    const key = name === 'if-match' ? 'ifMatch' : name === 'dry-run' ? 'dryRun' : name;
    if (['json', 'help', 'dry-run'].includes(name)) {
      if (inline !== undefined) invalid(`--${name} does not accept a value.`);
      parsed[key] = true;
    } else {
      const value = inline ?? rest[++i];
      if (value === undefined || (!inline && value.startsWith('-'))) invalid(`--${name} requires a value.`);
      parsed[key] = value;
    }
  }
  if (parsed.help) {
    if (seen.size !== 1 || parsed.namespace !== undefined) invalid('Use --help without target or other options.');
    return parsed;
  }
  if (operation === 'list' ? parsed.namespace !== undefined : !parsed.namespace) invalid(operation === 'list' ? 'list does not take a target.' : 'A namespace is required.');
  if (operation === 'write' && (seen.has('data') === seen.has('from'))) invalid('Specify exactly one of --data and --from.');
  if (['write', 'remove'].includes(operation) && parsed.ifMatch !== 'missing' && !/^[a-f0-9]{64}$/.test(parsed.ifMatch ?? '')) invalid('Supply --if-match missing or the etag returned by read.');
  return parsed;
}
function input(root, parsed) {
  let text = parsed.data;
  if (parsed.from !== undefined) {
    const path = resolve(root, parsed.from);
    let bytes;
    try { bytes = readFileSync(path); }
    catch { throw new UserDataError('USER_DATA_INPUT_UNREADABLE', 'Cannot read the JSON input file.', { target: path }); }
    if (bytes.length > 1024 * 1024) invalid('Input exceeds 1 MiB.');
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''); }
    catch { invalid('Input must be UTF-8 JSON.'); }
  }
  if (Buffer.byteLength(text) > 1024 * 1024) invalid('Input exceeds 1 MiB.');
  try { return JSON.parse(text); } catch { invalid('Input must be JSON.'); }
}
function render(response) {
  if (!response.ok) return response.errors.map(e => `${e.code}: ${e.message}`).join('\n') + '\n';
  const { data, operation } = response;
  if (operation === 'list') return data.entries.map(e => `${e.namespace}: ${e.state}${e.etag ? ` (${e.etag})` : ''}`).join('\n') + '\n';
  if (['read', 'check'].includes(operation)) return `${data.namespace}: ${data.state}\netag: ${data.etag}\n${JSON.stringify(data.values, null, 2)}\n`;
  return `${data.dryRun ? 'Preview' : data.changed ? 'Updated' : 'Unchanged'}: ${data.path}\netag: ${data.etag}\n${JSON.stringify(data.values, null, 2)}\n`;
}
export function runUserDataCommand(args, root) {
  const end = args.indexOf('--'), wantsJson = (end < 0 ? args : args.slice(0, end)).some(value => value === '--json');
  const response = { ok: false, command: 'user-data', operation: operations.has(args[0]) ? args[0] : null, data: null, errors: [] };
  let exitCode = 0;
  try {
    const parsed = parseUserDataArgs(args);
    if (parsed.help) return { stdout: userDataHelp(parsed.operation), exitCode: 0 };
    const options = { ...parsed, root };
    if (parsed.operation === 'write') options.values = input(root, parsed);
    const methods = { list: listUserData, read: readUserData, check: checkUserData, write: writeUserData, remove: removeUserData };
    response.data = methods[parsed.operation](options);
    if (parsed.operation === 'list' && response.data.errors.length) {
      response.errors = response.data.errors; delete response.data.errors; exitCode = 1;
    }
    response.ok = exitCode === 0;
  } catch (error) {
    const failure = error instanceof UserDataError ? error : new UserDataError('USER_DATA_IO_FAILED', 'User-data operation failed; the original file was preserved.', { cause: error.code });
    exitCode = failure.exitCode;
    response.errors.push({ code: failure.code, message: failure.message, ...failure.details });
  }
  return { stdout: wantsJson ? JSON.stringify(response) + '\n' : render(response), exitCode };
}
