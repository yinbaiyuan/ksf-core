import { invalid, MetadataError } from '../metadata/errors.js';
import { contextCapabilities } from '../services/context.js';

export function contextHelp(operation) {
  return `KSF context${operation ? ` ${operation}` : ''}\n\nUsage:\n` +
    '  ksf context capabilities [--json]\n\n' +
    'Return all effective workflow and partner discovery descriptions, workflows first.\n' +
    'Descriptions are preserved; bodies and related resources are not included.\n' +
    'Fixed entries remain marked. ability-route owns matching and fallback decisions.\n' +
    'Partial results remain available with exit 1; invalid arguments return exit 2.\n' +
    'Use --help or -h alone at either level to show help.\n';
}

function parseArgs(args) {
  if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { help: true };
  const [operation, ...options] = args;
  if (operation !== 'capabilities') invalid('Expected context capabilities.');
  if (options.length === 1 && ['--help', '-h'].includes(options[0])) return { operation, help: true };
  // No targets or scope selectors: this operation always returns the full set.
  if (options.length > 1 || (options.length === 1 && options[0] !== '--json')) {
    invalid('Use context capabilities with only --json, or --help alone.');
  }
  return { operation };
}

function render(result) {
  const lines = ['# KSF Capabilities'];
  if (result.data) {
    lines.push(`Complete: ${result.data.complete ? 'yes' : 'no'}`);
    for (const [key, title] of [['workflows', 'Workflows'], ['partners', 'Partners']]) {
      const group = result.data[key];
      lines.push(`\n## ${title} (${group.complete ? 'complete' : 'incomplete'})`);
      if (!group.objects.length) lines.push('(empty)');
      for (const object of group.objects) {
        lines.push(`\n- ${object.name}${object.protected ? ' [fixed entry]' : ''}`,
          `  ID: ${object.id}`, `  Definition: ${object.path}`,
          `  Fixed entry: ${object.protected ? 'yes' : 'no'}`, `Description:\n${object.description}`);
      }
    }
  }
  if (result.errors.length) {
    lines.push('\n## Errors');
    for (const error of result.errors) {
      lines.push(`${error.type ? `[${error.type}] ` : ''}${error.code}: ${error.message}` +
        (error.target ? ` (${error.target})` : ''));
    }
  }
  return lines.join('\n') + '\n';
}

export function runContextCommand(args, root) {
  const result = { ok: false, command: 'context', operation: args[0] === 'capabilities' ? 'capabilities' : null,
    data: null, errors: [] };
  let exitCode;
  try {
    const parsed = parseArgs(args);
    if (parsed.help) return { stdout: contextHelp(parsed.operation), exitCode: 0 };
    const response = contextCapabilities(root);
    result.data = response.data;
    result.errors = response.errors;
    result.ok = result.data.complete && result.errors.length === 0;
    exitCode = result.ok ? 0 : 1;
  } catch (failure) {
    const error = failure instanceof MetadataError ? failure
      : new MetadataError('CONTEXT_OPERATION_FAILED', 'Cannot obtain capability context.');
    result.errors = [{ code: error.code, message: error.message, ...error.details }];
    exitCode = error.exitCode;
  }
  const end = args.indexOf('--');
  const json = (end === -1 ? args : args.slice(0, end)).includes('--json');
  return { stdout: json ? JSON.stringify(result) + '\n' : render(result), exitCode };
}
