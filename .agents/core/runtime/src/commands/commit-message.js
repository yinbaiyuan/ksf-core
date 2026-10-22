import { parseOptions, optionSpecs, hasJsonFlag } from '../shared/options.js';
import { MetadataError, invalid } from '../metadata/errors.js';
import { checkCommitMessage, readCommitText, commitTemplatePath } from '../services/commit-message.js';

const help = 'KSF commit-message\n\nUsage:\n  ksf commit-message check --from <message-file> [--json]\n  ksf commit-message template [--json]\n\nCheck format only; diff, intent and verification evidence still require review.\nPaths are relative to the KSF root. No Git hooks or configuration are changed.\nUse --help or -h alone at command or operation level.\n';
export function runCommitMessageCommand(args, root) {
  const result = { ok: false, command: 'commit-message', operation: null, data: null, errors: [] };
  let exitCode = 0;
  try {
    if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { stdout: help, exitCode: 0 };
    const [operation, ...rest] = args;
    if (!['check', 'template'].includes(operation)) invalid('Expected commit-message check or template.');
    result.operation = operation;
    if (rest.length === 1 && ['--help', '-h'].includes(rest[0])) return { stdout: help, exitCode: 0 };
    const parsed = {};
    parseOptions(rest, { result: parsed, options: optionSpecs(operation === 'check' ? ['from', 'json'] : ['json']),
      invalid, target() { invalid('This command does not accept targets.'); } });
    if (operation === 'check') {
      if (!parsed.from) invalid('--from requires a commit message file.');
      result.data = checkCommitMessage(readCommitText(root, parsed.from));
      result.errors = result.data.errors;
      result.ok = result.data.valid;
      exitCode = result.ok ? 0 : 1;
    } else {
      result.data = { path: commitTemplatePath, template: readCommitText(root, commitTemplatePath) }; result.ok = true;
    }
  } catch (error) {
    result.errors = [{ code: error.code ?? 'COMMIT_MESSAGE_FAILED', message: error.message }];
    exitCode = error instanceof MetadataError ? error.exitCode : 1;
  }
  return { stdout: hasJsonFlag(args) ? JSON.stringify(result) + '\n' : result.operation === 'template' && result.ok ? result.data.template :
    [result.ok ? 'Commit message format is valid; semantic review is still required.' : '', ...result.errors.map(e => `${e.code}: ${e.message}`),
      ...(result.data?.warnings ?? []).map(e => `${e.code}: ${e.message}`)].filter(Boolean).join('\n') + '\n', exitCode };
}
