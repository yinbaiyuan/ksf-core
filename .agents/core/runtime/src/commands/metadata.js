import { parseOptions, optionSpecs, hasJsonFlag } from '../shared/options.js';
import { parseInput } from '../metadata/input.js';
import { resolve } from 'node:path';
import { MetadataError, invalid } from '../metadata/errors.js';
import { metadata, readInputFile } from '../services/metadata.js';

const operations = new Set(['read', 'write', 'remove', 'check']);
const supported = {
  read: ['fields', 'json', 'help'],
  write: ['data', 'from', 'dry-run', 'json', 'help'],
  remove: ['fields', 'all', 'dry-run', 'json', 'help'],
  check: ['json', 'help'],
};

export function metadataHelp(operation) {
  const usages = {
    read: 'read <file> [--fields <name...>] [--json]',
    write: 'write <file> (--data <JSON> | --from <file>) [--dry-run] [--json]',
    remove: 'remove <file> (--fields <name...> | --all) [--dry-run] [--json]',
    check: 'check <file> [--json]',
  };
  const lines = operation ? [usages[operation]] : Object.values(usages);
  return `KSF metadata${operation ? ` ${operation}` : ''}\n\nUsage:\n${lines.map(line => `  ksf metadata ${line}`).join('\n')}\n\n` +
    'Relative target and --from paths are based on the KSF root.\n' +
    'Place the target before --fields. Use -- to end option parsing.\n' +
    '--fields accepts one or more complete top-level names, separated by spaces.\n' +
    'Use --fields=<name> for a field name starting with a hyphen.\n' +
    'write merges top-level fields; null is a value. remove --all preserves the body.\n' +
    '--dry-run previews changes without writing the target. --help, -h show help.\n';
}

export function parseMetadataArgs(args) {
  if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { help: true };
  const [operation, ...rest] = args;
  if (!operations.has(operation)) invalid('Expected metadata read, write, remove or check.');
  const result = { operation, fields: [] };
  function target(value) {
    if (result.target !== undefined) invalid('Exactly one target file is required.');
    result.target = value;
  }
  const seen = parseOptions(rest, { result, invalid, target,
    options: optionSpecs(supported[operation], {
      all: { kind: 'flag' }, fields: { kind: 'many', inlineContinues: true, unique: true,
        before() { if (result.target === undefined) invalid('Place the target before --fields.'); },
        missing: '--fields requires at least one name.' },
    }),
    messages: { unknown: 'Unknown metadata option.', unsupported: name => `Option --${name} is not supported by metadata ${operation}.` },
  });
  if (result.help) {
    if (seen.size !== 1 || result.target !== undefined) invalid('Use --help without target or other options.');
    return result;
  }
  if (result.target === undefined || result.target === '') invalid('A target file is required.');
  if (operation === 'write' && (seen.has('data') === seen.has('from'))) invalid('Specify exactly one of --data or --from.');
  if (operation === 'remove' && (seen.has('fields') === seen.has('all'))) invalid('Specify exactly one of --fields or --all.');
  return result;
}

function render(result) {
  if (!result.ok) return result.errors.map(e => `${e.code}: ${e.message}${e.line ? ` (${e.line}:${e.column})` : ''}`).join('\n') + '\n';
  const { operation, data } = result;
  if (operation === 'read') return `Metadata: ${data.state}\n${JSON.stringify(data.values, null, 2)}\n` +
    (data.missingFields.length ? `Missing fields: ${JSON.stringify(data.missingFields)}\n` : '');
  if (operation === 'check') return `Metadata: ${data.state}; ${data.valid === null ? 'not set' : 'valid'}.\n`;
  return `${data.dryRun ? 'Preview' : data.changed ? 'Updated' : 'Unchanged'}: ${data.target}\n` +
    `${data.beforeState} -> ${data.afterState}\n${JSON.stringify(data.changes, null, 2)}\n` +
    (data.missingFields?.length ? `Missing fields: ${JSON.stringify(data.missingFields)}\n` : '');
}

export function runMetadataCommand(args, root) {
  let parsed;
  const wantsJson = hasJsonFlag(args);
  const operation = operations.has(args[0]) ? args[0] : null;
  const result = { ok: false, command: 'metadata', operation, data: null, errors: [] };
  let exitCode = 0;
  try {
    parsed = parseMetadataArgs(args);
    if (parsed.help) return { stdout: metadataHelp(parsed.operation), exitCode: 0 };
    const data = parsed.operation === 'write' ? parsed.from !== undefined ? readInputFile(root, parsed.from) : parseInput(parsed.data) : undefined;
    result.data = metadata({ ...parsed, data, root });
    result.ok = true;
  } catch (failure) {
    const error = failure instanceof MetadataError ? failure : new MetadataError('METADATA_FAILED', 'Metadata operation failed.');
    exitCode = error.exitCode;
    const { state, ...details } = error.details;
    if (parsed?.target) {
      result.data = { target: resolve(root, parsed.target) };
      if (state && ['read', 'check'].includes(parsed.operation)) result.data.state = state;
      if (state === 'invalid' && parsed.operation === 'check') result.data.valid = false;
      if (['write', 'remove'].includes(parsed.operation)) Object.assign(result.data, { dryRun: !!parsed.dryRun, changed: false });
    }
    result.errors.push({ code: error.code, message: error.message, ...details });
  }
  return { stdout: wantsJson ? `${JSON.stringify(result)}\n` : render(result), exitCode };
}
