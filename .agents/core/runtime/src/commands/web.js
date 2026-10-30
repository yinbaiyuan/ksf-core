import { hasJsonFlag, parseOptions, optionSpecs } from '../shared/options.js';
import { invalid } from '../metadata/errors.js';
import { startWebServer, WEB_PORT } from '../services/web.js';
import { readWebHosts, WEB_LOCAL_NAME } from '../services/web-hosts.js';
import { runWebHostsCommand } from './web-hosts.js';

export function webHelp() {
  return 'KSF web\n\nUsage:\n' +
    '  ksf web [--port <0-65535>] [--json]\n' +
    '  ksf web hosts [--apply] [--json]\n' +
    '  ksf web --help\n\n' +
    `Start a foreground HTTP server on 127.0.0.1 (default port ${WEB_PORT}).\n` +
    'Use http://ksf.ai:1313/ after configuring the system hosts mapping. Use the user login service for background operation.\n' +
    'Port 0 chooses a free port. Press Ctrl+C to stop.\n' +
    'Serves task turns and routing, read-only task/route APIs and GET /api/health; enabled transcript catch-up runs while open.\n' +
    '--json prints one readiness result after listening; later errors use stderr.\n';
}

export async function runWebCommand(args, root) {
  if (args[0] === 'hosts') return runWebHostsCommand(args.slice(1));
  const json = hasJsonFlag(args);
  let instance;
  let announced = false;
  const report = error => {
    const result = { ok: false, command: 'web', operation: null, data: null,
      errors: [{ code: error.code ?? 'WEB_START_FAILED', message: error.message }] };
    const text = json ? JSON.stringify(result) + '\n' : `${result.errors[0].code}: ${error.message}\n`;
    (announced ? process.stderr : process.stdout).write(text);
  };
  try {
    if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
      process.stdout.write(webHelp()); return 0;
    }
    const parsed = { port: WEB_PORT };
    parseOptions(args, { result: parsed, options: optionSpecs(['port', 'json']), invalid,
      target() { invalid('Web does not accept positional arguments.'); } });
    if (!/^\d+$/.test(String(parsed.port)) || Number(parsed.port) > 65535) {
      invalid('Expected --port between 0 and 65535.');
    }
    const fd = process.env.KSF_WEB_LISTEN_FD;
    if (fd !== undefined && (!/^\d+$/.test(fd) || Number(fd) < 3 || !Number.isSafeInteger(Number(fd)))) invalid('Invalid inherited Web listener.');
    instance = await startWebServer({ root, port: Number(parsed.port), listenFD: fd === undefined ? undefined : Number(fd) });
    const { host, port, url, startedAt, nodeVersion } = instance;
    const hosts = readWebHosts();
    const localUrl = hosts.state === 'configured' ? `http://${WEB_LOCAL_NAME}${port === 80 ? '' : `:${port}`}/` : null;
    if (port === WEB_PORT && !localUrl) process.stderr.write(`WEB_HOSTS_${hosts.state.toUpperCase()}: Configure the ksf.ai loopback entries with web hosts --apply; use the direct loopback URL until then.\n`);
    return await new Promise(resolve => {
      let stopping = false;
      const stop = error => {
        if (stopping) return;
        stopping = true;
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);
        instance.server.off('error', onError);
        instance.server.off('ksf-stop',onSignal);
        if (error) report(error);
        instance.close().then(() => resolve(error ? 1 : 0), failure => { report(failure); resolve(1); });
      };
      const onSignal = () => stop();
      const onError = () => stop(Object.assign(new Error('The local Web server failed.'), { code: 'WEB_SERVER_FAILED' }));
      process.once('SIGINT', onSignal);
      process.once('SIGTERM', onSignal);
      instance.server.once('error', onError);
      instance.server.once('ksf-stop',onSignal);
      const result = { ok: true, command: 'web', operation: null,
        data: { host, port, url, localUrl, startedAt, nodeVersion, hosts: hosts.state }, errors: [] };
      announced = true;
      process.stdout.write(json ? JSON.stringify(result) + '\n' : `KSF Web: ${localUrl ?? url}\n${localUrl ? `Direct: ${url}\n` : ''}Press Ctrl+C to stop.\n`);
    });
  } catch (error) {
    if (instance) await instance.close();
    report(error);
    return error.exitCode ?? 1;
  }
}
