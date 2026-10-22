import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fail, hash, put } from './files.js';

export function inspectHost() {
  const executable = (process.env.PATH ?? '').split(':').map(p => join(p, 'codex')).find(p => existsSync(p));
  if (!executable) fail('EVAL_CODEX_UNAVAILABLE', 'Codex CLI is not on PATH.');
  const version = spawnSync(executable, ['--version'], { encoding: 'utf8' });
  if (version.status !== 0) fail('EVAL_CODEX_UNAVAILABLE', 'Cannot read Codex CLI version.');
  const configHome = process.env.CODEX_HOME || join(homedir(), '.codex');
  const text = existsSync(join(configHome, 'config.toml')) ? readFileSync(join(configHome, 'config.toml'), 'utf8').split(/^\[/m)[0] : '';
  const value = key => text.match(new RegExp(`^${key}\\s*=\\s*"([^"\\n]+)"`, 'm'))?.[1] ?? null;
  if (value('model_provider') && value('model_provider') !== 'openai') fail('EVAL_PROVIDER_UNSUPPORTED', 'The first adapter supports existing OpenAI Codex authentication only.');
  if (!value('model')) fail('EVAL_MODEL_UNRESOLVED', 'Set an explicit existing Codex model before evaluating; the runner does not choose one.');
  if (!existsSync(join(configHome, 'auth.json'))) fail('EVAL_AUTH_UNAVAILABLE', 'Existing Codex auth.json is required; no login or credential collection is performed.');
  if (process.platform !== 'darwin' || !existsSync('/usr/bin/sandbox-exec')) fail('EVAL_ISOLATION_UNAVAILABLE', 'The first adapter requires the verified macOS sandbox guard.');
  return { executable: realpathSync(executable), version: version.stdout.trim(), model: value('model'),
    reasoningEffort: value('model_reasoning_effort'), configHome, configuredModelProvenance: 'existing user config; explicit invocation; backend identity is not inferred' };
}
export const publicHost = ({ configHome, ...rest }) => ({ ...rest, executionPolicy: {
  sandbox: 'native ksf-eval permission profile', approvalPolicy: 'never', businessNetwork: false, inheritedConfig: false,
  memories: false, plugins: false, apps: false, mcp: false, browser: false, subagents: false,
  originalInstanceRead: 'denied for tools by the native permission profile', writes: 'per-case disposable directory only',
  reviewerInput: 'frozen test contract and visible evidence; independent new session',
} });
const quote = value => JSON.stringify(value);
export function guardProfile(sourceRoot, privateRoot, host, home, readOnlyRoots = []) {
  return `default_permissions = "ksf-eval"\n[permissions.ksf-eval.filesystem]\n":minimal" = "read"\n` +
    `"/System/Library" = "read"\n"/usr" = "read"\n` +
    `${quote(realpathSync(privateRoot))} = "write"\n${quote(realpathSync(sourceRoot))} = "deny"\n` +
    `${quote(join(homedir(), '.codex'))} = "deny"\n${quote(join(homedir(), '.agents'))} = "deny"\n` +
    `${quote(join(realpathSync(privateRoot), 'host-homes'))} = "deny"\n` +
    `${quote(dirname(dirname(host.executable)))} = "read"\n${quote(home)} = "deny"\n` +
    readOnlyRoots.map(p => `${quote(realpathSync(p))} = "read"\n`).join('') +
    `[permissions.ksf-eval.network]\nenabled = false\n`;
}
export function verifyGuard(sourceRoot, privateRoot, workspace) {
  const host = inspectHost(), home = join(privateRoot, 'guard-profile'); mkdirSync(home, { recursive: true });
  put(home, 'config.toml', guardProfile(sourceRoot, privateRoot, host, home));
  put(privateRoot, 'guard-readable.txt', 'guard-ok');
  const check = (cmd, args) => spawnSync(host.executable, ['sandbox', '-P', 'ksf-eval', '-C', privateRoot, '--', cmd, ...args], {
    cwd: privateRoot, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: homedir(), CODEX_HOME: home, TMPDIR: privateRoot } });
  const ownRead = check('/bin/cat', [join(privateRoot, 'guard-readable.txt')]);
  const sourceRead = check('/bin/cat', [join(sourceRoot, 'AGENTS.md')]);
  const ownWrite = check('/usr/bin/touch', [join(privateRoot, 'guard-write.txt')]);
  const outside = mkdtempSync(join(tmpdir(), 'ksf-eval-guard-outside-'));
  let outsideWrite, control;
  try {
    const target = join(outside, 'probe');
    control = spawnSync('/usr/bin/touch', [target]);
    outsideWrite = check('/usr/bin/touch', [target]);
  } finally { rmSync(outside, { recursive: true, force: true }); }
  const valid = ownRead.stdout === 'guard-ok' && ownWrite.status === 0 && sourceRead.status !== 0 && control.status === 0 && outsideWrite.status !== 0;
  if (!valid) fail('EVAL_ISOLATION_FAILED', `Native permission-profile probes failed: ${JSON.stringify({ ownRead: ownRead.status, ownReadError: ownRead.stderr, ownWrite: ownWrite.status, sourceRead: sourceRead.status, outsideWrite: outsideWrite.status })}`);
  let bootstrap = null;
  if (workspace) {
    const result = check(join(workspace, '.agents/ksf'), ['hello', '--json']);
    if (result.status !== 0) fail('EVAL_FIXTURE_BOOTSTRAP_FAILED', `Copied CLI cannot execute within the actual permission profile: ${result.stderr}`);
    bootstrap = { exitCode: result.status, stdout: result.stdout };
  }
  return { valid, ownRead: ownRead.status, ownWrite: ownWrite.status, sourceReadBlocked: sourceRead.status !== 0, outsideWriteBlocked: outsideWrite.status !== 0, bootstrap };
}

export function prepareHome(host, privateRoot, name, sourceRoot = process.cwd(), readOnlyRoots = []) {
  const home = join(privateRoot, 'host-homes', name); mkdirSync(home, { recursive: true, mode: 0o700 });
  copyFileSync(join(host.configHome, 'auth.json'), join(home, 'auth.json'));
  chmodSync(join(home, 'auth.json'), 0o600);
  // No inherited config, MCP servers, global instructions, skills, history, plugins or memories.
  put(home, 'config.toml', `model = ${quote(host.model)}\n${host.reasoningEffort ? `model_reasoning_effort = ${quote(host.reasoningEffort)}\n` : ''}approval_policy = "never"\nweb_search = "disabled"\n` +
    guardProfile(sourceRoot, privateRoot, host, home, readOnlyRoots) +
    `[shell_environment_policy]\ninherit = "none"\n[shell_environment_policy.set]\nPATH = ${quote(process.env.PATH ?? '/usr/bin:/bin')}\n[features]\nmemories = false\napps = false\nplugins = false\nhooks = false\nmulti_agent = false\ncomputer_use = false\nbrowser_use = false\nbrowser_use_external = false\nin_app_browser = false\nshell_snapshot = false\n`, { mode: 0o600 });
  return home;
}

export function prepareCertificates(privateRoot) {
  // Export only Apple's shipped trust anchors, not arbitrary login-keychain certificates.
  // The process write guard can prevent native trust-cache refresh; verification stays enabled.
  const certificate = process.env.CODEX_CA_CERTIFICATE || process.env.SSL_CERT_FILE;
  const bundle = certificate ? readFileSync(certificate) : (() => {
    const result = spawnSync('/usr/bin/security', ['find-certificate', '-a', '-p', '/System/Library/Keychains/SystemRootCertificates.keychain'], { encoding: 'utf8' });
    if (result.status !== 0 || !result.stdout.includes('BEGIN CERTIFICATE')) fail('EVAL_CERTIFICATES_UNAVAILABLE', 'Cannot load the existing trusted CA bundle.');
    return Buffer.from(result.stdout);
  })();
  const path = join(privateRoot, 'trusted-ca.pem'); put(privateRoot, 'trusted-ca.pem', bundle, { mode: 0o600 });
  return { path, sha256: hash(bundle), provenance: certificate ? 'explicit existing CODEX_CA_CERTIFICATE/SSL_CERT_FILE' : 'Apple SystemRootCertificates.keychain public anchors' };
}

export const redact = text => text.replace(/(?:Bearer\s+)[A-Za-z0-9_.\-]+/gi, 'Bearer [REDACTED]')
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_TOKEN]')
  .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED_KEY]');

export async function invokeCodex({ host, sourceRoot, privateRoot, workspace, home, prompt, sessionId, schema, timeoutMs, onEvent = () => {} }) {
  const flags = ['--json', '--ignore-rules', '--strict-config', '--skip-git-repo-check'];
  const args = sessionId ? ['exec', 'resume', sessionId, ...flags, '-'] : ['exec', '-C', workspace, ...flags, '-'];
  if (schema) args.splice(args.length - 1, 0, '--output-schema', schema);
  const startedAt = new Date().toISOString(), events = [], parseErrors = [];
  const certificates = prepareCertificates(privateRoot);
  let stderr = '', pending = '', timedOut = false, cancelled = false, outputLimit = false, seenBytes = 0;
  const result = await new Promise(resolveResult => {
    const child = spawn(host.executable, args, {
      cwd: workspace, detached: true, stdio: ['pipe', 'pipe', 'pipe'], env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: homedir(), USER: process.env.USER ?? '', LANG: 'en_US.UTF-8',
        CODEX_HOME: home, TMPDIR: privateRoot, RUST_LOG: 'error', CODEX_CA_CERTIFICATE: certificates.path,
      },
    });
    const stop = () => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} };
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
    let killTimer;
    const scheduleKill = () => { if (killTimer) return; killTimer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 4000); killTimer.unref(); };
    const abort = () => { cancelled = true; stop(); scheduleKill(); };
    process.once('SIGINT', abort); process.once('SIGTERM', abort);
    const line = text => {
      if (!text.trim()) return;
      try {
        const event = JSON.parse(redact(text));
        if (event.item?.type === 'reasoning') return; // No collection of reasoning summaries or hidden thought.
        events.push(event); onEvent(event);
      } catch { parseErrors.push(redact(text).slice(0, 500)); }
    };
    child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => {
      seenBytes += Buffer.byteLength(chunk);
      if (seenBytes > 16 * 1024 * 1024) { outputLimit = true; stop(); scheduleKill(); return; }
      pending += chunk; const rows = pending.split('\n'); pending = rows.pop(); rows.forEach(line);
    });
    child.stderr.setEncoding('utf8'); child.stderr.on('data', chunk => { if (stderr.length < 256000) stderr += redact(chunk); });
    child.on('error', error => { clearTimeout(timer); resolveResult({ exitCode: null, signal: null, spawnError: error.code }); });
    child.on('close', (exitCode, signal) => { clearTimeout(timer); clearTimeout(killTimer); try { process.kill(-child.pid, 'SIGTERM'); } catch {} process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); if (pending) line(pending); resolveResult({ exitCode, signal }); });
    child.stdin.on('error', () => {}); child.stdin.end(prompt);
    // Bound the entire process group, including tool grandchildren.
    timer.unref();
    const tick = setInterval(() => { if (timedOut) { scheduleKill(); clearInterval(tick); } }, 1000); tick.unref(); child.on('close', () => clearInterval(tick));
  });
  return { ...result, startedAt, completedAt: new Date().toISOString(), events, stderr, parseErrors, timedOut, cancelled, outputLimit,
    certificates: { sha256: certificates.sha256, provenance: certificates.provenance } };
}
export function removeHome(home) { rmSync(home, { recursive: true, force: true }); }
