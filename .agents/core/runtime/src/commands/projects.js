import { MetadataError, invalid } from '../metadata/errors.js';
import { parseInput, readInputFile } from '../services/metadata.js';
import { project, errorItem } from '../services/projects.js';

const supported = {
  list: ['json', 'help'], read: ['part', 'json', 'help'],
  write: ['data', 'from', 'dry-run', 'json', 'help'],
  remove: ['dry-run', 'json', 'help'], check: ['json', 'help'],
};
const usages = {
  list: 'list [--json]',
  read: 'read <name> [--part metadata|body|all] [--json]',
  write: 'write <name> (--data <JSON> | --from <file>) [--dry-run] [--json]',
  remove: 'remove <name> [--dry-run] [--json]',
  check: 'check [name] [--json]',
};

export function projectHelp(operation) {
  return `KSF project${operation ? ` ${operation}` : ''}\n\nUsage:\n` +
    (operation ? [usages[operation]] : Object.values(usages)).map(usage => `  ksf project ${usage}`).join('\n') + '\n\n' +
    'Targets are directory names under 项目/, not paths or capability IDs.\n' +
    'read defaults to all; list returns root-card summaries without bodies.\n' +
    'write accepts {"metadata": {...}, "body": "..."}; creation requires body.\n' +
    'Metadata merges top-level fields; a supplied body replaces the full body.\n' +
    'remove deletes the ENTIRE project directory, including all resources.\n' +
    'check without a name checks all root cards; no business or link validation.\n' +
    '--from paths are relative to the KSF root; absolute input paths are accepted.\n' +
    '--dry-run previews without writes. Use -- before a name starting with a hyphen.\n' +
    'Use --help or -h alone at command or operation level.\n';
}

export function parseProjectArgs(args) {
  if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { help: true };
  const [operation, ...rest] = args;
  if (!Object.hasOwn(supported, operation)) invalid('Expected project list, read, write, remove or check.');
  const parsed = { operation }, seen = new Set();
  let ended = false;
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === '--' && !ended) { ended = true; continue; }
    if (ended || !token.startsWith('-')) {
      if (parsed.name !== undefined) invalid('Only one project name is allowed.');
      parsed.name = token; continue;
    }
    const match = /^(?:--([a-z][a-z-]*)(?:=(.*))?|-([h]))$/s.exec(token);
    if (!match) invalid('Unknown project option.');
    const option = match[1] ?? 'help', inline = match[2];
    if (!supported[operation].includes(option)) invalid(`Option --${option} is not supported by project ${operation}.`);
    if (seen.has(option)) invalid(`Option --${option} cannot be repeated.`);
    seen.add(option);
    if (['json', 'dry-run', 'help'].includes(option)) {
      if (inline !== undefined) invalid(`Option --${option} does not accept a value.`);
      parsed[option === 'dry-run' ? 'dryRun' : option] = true;
    } else {
      const value = inline ?? rest[i + 1];
      if (value === undefined || (inline === undefined && value.startsWith('-'))) invalid(`Option --${option} requires a value.`);
      parsed[option] = value;
      if (inline === undefined) i++;
    }
  }
  if (parsed.help) {
    if (seen.size !== 1 || parsed.name !== undefined) invalid('Use --help without a target or other options.');
    return parsed;
  }
  if (operation === 'list' && parsed.name !== undefined) invalid('Project list does not accept a target.');
  if (!['list', 'check'].includes(operation) && parsed.name === undefined) invalid('A project name is required.');
  if (parsed.part !== undefined && !['metadata', 'body', 'all'].includes(parsed.part)) invalid('--part must be metadata, body or all.');
  if (operation === 'write' && seen.has('data') === seen.has('from')) invalid('Specify exactly one of --data or --from.');
  return parsed;
}

function render(result) {
  const lines = [];
  const { operation, data } = result;
  if (data) {
    if (operation === 'list' || (operation === 'check' && data.projects)) {
      lines.push(`Projects: ${data.complete ? 'complete' : 'incomplete'}`);
      if (!data.projects.length) lines.push('(empty)');
      for (const row of data.projects) lines.push(`- ${row.name}${row.title ? `: ${row.title}` : ''} (${row.path})` +
        (operation === 'check' ? `; ${row.valid ? 'valid' : 'invalid'}` : '') +
        (row.description !== null && row.description !== undefined ? `\n  Description: ${JSON.stringify(row.description)}` : '') +
        (row.status !== null && row.status !== undefined ? `\n  Status: ${JSON.stringify(row.status)}` : ''));
    } else if (operation === 'read') {
      lines.push(`Project: ${data.project.name} (${data.project.path}); metadata: ${data.project.state}`);
      if (Object.hasOwn(data.project, 'metadata')) lines.push(JSON.stringify(data.project.metadata, null, 2));
      if (Object.hasOwn(data.project, 'body')) lines.push(data.project.body);
    } else if (operation === 'check') lines.push(`Project: ${data.name}; ${data.valid ? 'valid' : 'invalid'}.`);
    else lines.push(`${data.dryRun ? 'Preview' : data.changed ? operation === 'remove' ? 'Removed' : 'Updated' : 'Unchanged'}: ${data.path}`,
      JSON.stringify(data, null, 2));
  }
  for (const error of result.errors) lines.push(`${error.code}: ${error.message}${error.target ? ` (${error.target})` : ''}`);
  return lines.join('\n') + '\n';
}

export function runProjectCommand(args, root) {
  const result = { ok: false, command: 'project', operation: Object.hasOwn(supported, args[0]) ? args[0] : null, data: null, errors: [] };
  let exitCode;
  try {
    const parsed = parseProjectArgs(args);
    if (parsed.help) return { stdout: projectHelp(parsed.operation), exitCode: 0 };
    const data = parsed.operation === 'write'
      ? parsed.from !== undefined ? readInputFile(root, parsed.from) : parseInput(parsed.data) : undefined;
    const response = project({ ...parsed, data, root });
    result.data = response.data; result.errors = response.errors;
    result.ok = result.errors.length === 0;
    exitCode = result.ok ? 0 : 1;
  } catch (error) {
    const item = errorItem(error);
    if (item.data) { result.data = item.data; delete item.data; }
    result.errors = [item];
    exitCode = error instanceof MetadataError ? error.exitCode : 1;
  }
  const end = args.indexOf('--');
  const json = (end === -1 ? args : args.slice(0, end)).includes('--json');
  return { stdout: json ? JSON.stringify(result) + '\n' : render(result), exitCode };
}
