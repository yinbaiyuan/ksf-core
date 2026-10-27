import { configureWebHosts } from '../services/web-hosts.js';
import { hasJsonFlag, parseOptions, optionSpecs } from '../shared/options.js';
import { invalid } from '../metadata/errors.js';

export function runWebHostsCommand(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write('KSF web hosts\n\nUsage:\n  ksf web hosts [--apply] [--json]\n\nWithout --apply, inspect the hosts mapping without writing.\n--apply adds missing IPv4 and mapped IPv6 loopback entries for ksf.ai; administrator permission is required.\nExisting conflicting mappings are preserved and reported.\n');
    return 0;
  }
  const json = hasJsonFlag(args);
  try {
    const parsed = { apply: false };
    parseOptions(args, { result: parsed, options: optionSpecs(['apply', 'json'], { apply: { kind: 'flag' } }), invalid,
      target() { invalid('Web hosts does not accept positional arguments.'); } });
    const data = configureWebHosts({ apply: parsed.apply });
    process.stdout.write(json ? JSON.stringify({ ok: true, command: 'web', operation: 'hosts', data, errors: [] }) + '\n'
      : `${data.state}: ${data.path}\n${data.entry}\n${data.apply ? data.changed ? 'Mapping added.\n' : 'No changes needed.\n' : 'Read-only check; use --apply with administrator permission to add a missing mapping.\n'}`);
    return 0;
  } catch (error) {
    const result = { ok: false, command: 'web', operation: 'hosts', data: null, errors: [{ code: error.code ?? 'WEB_HOSTS_FAILED', message: error.message }] };
    process.stdout.write(json ? JSON.stringify(result) + '\n' : `${result.errors[0].code}: ${error.message}\n`);
    return error.exitCode ?? 1;
  }
}
