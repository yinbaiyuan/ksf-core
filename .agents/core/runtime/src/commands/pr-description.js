import { parseOptions, optionSpecs, hasJsonFlag } from '../shared/options.js';
import { MetadataError, invalid } from '../metadata/errors.js';
import { checkPRDescription, readPRText, prTemplatePath } from '../services/pr-description.js';

const help = 'KSF pr-description\n\nUsage:\n  ksf pr-description check --title <title> --from <body-file> [--json]\n  ksf pr-description template [--json]\n\nCheck title and Markdown format only; diff, impact and evidence still require review.\nPaths are relative to the KSF root. No Git or remote changes are made.\nUse --help or -h alone at command or operation level.\n';
export function runPRDescriptionCommand(args, root) {
  const result = { ok: false, command: 'pr-description', operation: null, data: null, errors: [] };
  let exitCode = 0;
  try {
    if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) return { stdout: help, exitCode: 0 };
    const [operation, ...rest] = args;
    if (!['check', 'template'].includes(operation)) invalid('Expected pr-description check or template.');
    result.operation = operation;
    if (rest.length === 1 && ['--help', '-h'].includes(rest[0])) return { stdout: help, exitCode: 0 };
    const parsed = {};
    parseOptions(rest, { result: parsed, options: optionSpecs(operation === 'check' ? ['title', 'from', 'json'] : ['json']),
      invalid, target() { invalid('This command does not accept targets.'); } });
    if (operation === 'check') {
      if (!parsed.title || !parsed.from) invalid('Supply --title and --from for the PR body file.');
      result.data = checkPRDescription(parsed.title, readPRText(root, parsed.from));
      result.errors = result.data.errors; result.ok = result.data.valid; exitCode = result.ok ? 0 : 1;
    } else {
      result.data = { path: prTemplatePath, template: readPRText(root, prTemplatePath) }; result.ok = true;
    }
  } catch (error) {
    result.errors = [{ code: error.code ?? 'PR_DESCRIPTION_FAILED', message: error.message }];
    exitCode = error instanceof MetadataError ? error.exitCode : 1;
  }
  return { stdout: hasJsonFlag(args) ? JSON.stringify(result) + '\n' : result.operation === 'template' && result.ok ? result.data.template :
    [result.ok ? 'PR description format is valid; semantic review is still required.' : '', ...result.errors.map(e => `${e.code}: ${e.message}`),
      ...(result.data?.warnings ?? []).map(e => `${e.code}: ${e.message}`)].filter(Boolean).join('\n') + '\n', exitCode };
}
