import { parseOptions, optionSpecs, hasJsonFlag } from '../shared/options.js';
import { invalid } from '../metadata/errors.js';
import { checkRouting, readRun, runRouting } from '../eval/runner.js';

const help = 'KSF eval\n\nUsage:\n  ksf eval check routing [--json]\n  ksf eval run routing --profile calibration|core [--json]\n  ksf eval read <run-id> [--json]\n\ncheck is offline and never invokes a model. run explicitly invokes independent Codex subjects and reviewers.\ncore requires a calibrated run with identical frozen inputs and host. Reports preserve every anomaly and unrun case count.\nCurrent adapter: macOS, existing Codex CLI authentication and an explicit configured model.\n';
export async function runEvalCommand(args, root, dependencies = {}) {
  const envelope = { ok: false, command: 'eval', operation: null, data: null, errors: [] };
  let exitCode = 0;
  try {
    if (!args.length || args.length === 1 && ['--help', '-h'].includes(args[0])) return { stdout: help, exitCode };
    const [operation, ...rest] = args; envelope.operation = operation;
    if (!['check', 'run', 'read'].includes(operation)) invalid('Expected eval check, run or read.');
    if (rest.length === 1 && ['--help', '-h'].includes(rest[0])) return { stdout: help, exitCode };
    const parsed = {};
    parseOptions(rest, { result: parsed, options: optionSpecs(operation === 'run' ? ['json', 'profile'] : ['json']), invalid,
      target(value) { if (parsed.target) invalid('Supply exactly one target.'); parsed.target = value; } });
    if (!parsed.target) invalid('Supply routing or an exact saved run ID.');
    if (operation !== 'read' && parsed.target !== 'routing') invalid('Only the routing evaluation suite is supported.');
    if (operation === 'run' && !['calibration', 'core'].includes(parsed.profile)) invalid('Explicitly supply --profile calibration or core.');
    if (operation === 'check') { envelope.data = checkRouting(root, dependencies); envelope.ok = envelope.data.valid; envelope.errors = envelope.data.errors; }
    else if (operation === 'read') { envelope.data = readRun(root, parsed.target); envelope.ok = true; }
    else {
      envelope.data = await runRouting(root, parsed.profile, { onProgress: progress => process.stderr.write(JSON.stringify(progress) + '\n'), ...dependencies });
      envelope.ok = envelope.data.status === 'completed' && envelope.data.results.every(r => r.verdict === 'pass');
      if (!envelope.ok) envelope.errors = [{ code: 'EVAL_NOT_ALL_PASSED', message: 'See per-case results, anomalies and not-run counts; no automatic rule changes were made.' }];
    }
    if (!envelope.ok) exitCode = 1;
  } catch (error) { exitCode = error.exitCode ?? 1; envelope.errors = [{ code: error.code ?? 'EVAL_FAILED', message: error.message }]; }
  return { exitCode, stdout: hasJsonFlag(args) ? JSON.stringify(envelope) + '\n' : envelope.data?.runId ?
    `${envelope.data.runId}: ${JSON.stringify(envelope.data.summary)}\n` : JSON.stringify(envelope, null, 2) + '\n' };
}
