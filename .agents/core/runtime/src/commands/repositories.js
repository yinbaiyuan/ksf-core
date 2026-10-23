import { parseOptions, optionSpecs, hasJsonFlag } from '../shared/options.js';
import { MetadataError, invalid } from '../metadata/errors.js';
import { repository, repositoryErrorItem } from '../services/repositories.js';

const supported = {
  create: ['dry-run', 'json', 'help'],
  link: ['project', 'scope', 'dry-run', 'json', 'help'], unlink: ['project', 'scope', 'dry-run', 'json', 'help'],
  list: ['project', 'scope', 'json', 'help'], check: ['project', 'scope', 'json', 'help'],
};
const usages = {
  create: 'create <name> [--dry-run] [--json]',
  link: 'link <path> --project <project-name> [--scope current|archived] [--dry-run] [--json]',
  unlink: 'unlink <path> --project <project-name> [--scope current|archived] [--dry-run] [--json]',
  list: 'list [--project <project-name> [--scope current|archived]] [--json]',
  check: 'check [path | --project <project-name> [--scope current|archived]] [--json]',
};
export function repositoryHelp(operation) {
  return 'KSF repository\n\nUsage:\n' + (operation ? [usages[operation]] : Object.values(usages)).map(usage => `  ksf repository ${usage}`).join('\n') +
    '\n\nNew local Git roots live in repositories/<name>, ignored by the outer KSF Git repository.\n' +
    'Paths resolve from the KSF root; project names select 项目/ or 档案/项目/ with --scope current|archived (default current).\n' +
    'create initializes main with no commits or remote. Existing valid Git roots are unchanged.\n' +
    'link/unlink change only project repositories metadata; unlink never deletes files.\n' +
    'list/check default to direct children; --project includes external linked repositories.\n' +
    'No clone, move, delete, commit or push operation is provided.\n' +
    '--dry-run writes no target directories, files or locks. Use --help or -h alone.\n';
}
export function parseRepositoryArgs(args) {
  if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { help: true };
  const [operation, ...rest] = args;
  if (!Object.hasOwn(supported, operation)) invalid('Expected repository create, link, unlink, list or check.');
  const parsed = { operation };
  const projectMissing = '--project requires one project directory name.';
  const seen = parseOptions(rest, { result: parsed, invalid,
    options: optionSpecs(supported[operation], { project: { kind: 'value', key: 'projectName', missing: projectMissing,
      validate(value) { if (!value.trim()) invalid(projectMissing); } } }),
    target(token) {
      if (parsed.target !== undefined) invalid('Only one repository target is allowed.');
      parsed.target = token;
    },
    messages: { unknown: 'Unknown repository option.', unsupported: 'Unsupported or repeated repository option.',
      repeated: 'Unsupported or repeated repository option.', flagValue: name => `--${name} does not accept a value.` },
  });
  if (parsed.help && (seen.size !== 1 || parsed.target !== undefined)) invalid('Use --help without a target or other options.');
  if (!parsed.help) {
    if (parsed.scope !== undefined && (!['current', 'archived'].includes(parsed.scope) || parsed.projectName === undefined)) invalid('--scope current|archived requires --project.');
    if (['create', 'link', 'unlink'].includes(operation) && parsed.target === undefined) invalid('A repository target is required.');
    if (['link', 'unlink'].includes(operation) && parsed.projectName === undefined) invalid('--project is required.');
    if (operation === 'list' && parsed.target !== undefined) invalid('list does not accept a target.');
    if (operation === 'check' && parsed.target !== undefined && parsed.projectName !== undefined) invalid('Choose a path or --project.');
  }
  return parsed;
}
export function runRepositoryCommand(args, root) {
  const result = { ok: false, command: 'repository', operation: Object.hasOwn(supported, args[0]) ? args[0] : null, data: null, errors: [] };
  let exitCode;
  try {
    const parsed = parseRepositoryArgs(args);
    if (parsed.help) return { stdout: repositoryHelp(parsed.operation), exitCode: 0 };
    const response = repository({ root, ...parsed });
    result.data = response.data; result.errors = response.errors; result.ok = !response.errors.length;
    exitCode = result.ok ? 0 : 1;
  } catch (error) {
    const item = repositoryErrorItem(error);
    if (item.data) { result.data = item.data; delete item.data; }
    result.errors = [item]; exitCode = error instanceof MetadataError ? error.exitCode : 1;
  }
  const json = hasJsonFlag(args);
  const lines = [`Repository ${result.operation ?? 'command'}: ${result.ok ? 'ok' : 'failed'}`];
  if (result.data) lines.push(JSON.stringify(result.data, null, 2));
  for (const error of result.errors) lines.push(`${error.code}: ${error.message}`);
  return { stdout: json ? JSON.stringify(result) + '\n' : lines.join('\n') + '\n', exitCode };
}
