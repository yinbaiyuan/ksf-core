import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fail, requireAI } from '../schema.js';
import {platform} from '../../platform/index.js';
import {supportedCodexVersion} from './codex-compatibility.js';

export async function runCodex(spec, { signal, onIdentity = async () => {}, env = process.env } = {}) {
  const version = spawnSync(spec.executablePath, ['--version'], { encoding: 'utf8', timeout: 10000, maxBuffer: 8192, env });
  requireAI(version.status === 0 && supportedCodexVersion(version.stdout??''), 'AI_CLI_VERSION_UNSUPPORTED', 'Codex CLI 版本不属于已验证范围，请核对安装版本。');
  const cwd = await mkdtemp(join(tmpdir(), 'ksf-ai-codex-'));
  const finalPath = join(cwd, 'final.txt'), schemaPath = join(cwd, 'output-schema.json');
  if (spec.schema) await writeFile(schemaPath, JSON.stringify(spec.schema), { mode: 0o400 });
  const args = ['--no-daemon', '-a', 'never', 'exec', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--ephemeral', '--json', '--color', 'never', '--sandbox', 'read-only', '-C', cwd, '-o', finalPath, '-c', 'project_doc_max_bytes=0', '-c', 'web_search="disabled"'];
  for (const feature of ['shell_tool', 'apps', 'plugins', 'hooks', 'multi_agent', 'multi_agent_v2', 'browser_use', 'computer_use', 'code_mode_host']) args.push('--disable', feature);
  if (spec.model) args.push('-m', spec.model);
  if (spec.reasoningEffort) args.push('-c', `model_reasoning_effort="${spec.reasoningEffort}"`);
  if (spec.schema) args.push('--output-schema', schemaPath);
  args.push('-');
  const child = spawn(spec.executablePath, args, { cwd, env, detached: platform.detachedChildren, stdio: ['pipe', 'pipe', 'pipe'] });
  let line = '', total = 0, parseError, threadId, completed = false, usage = null, settled = false;
  let identityError;
  const identities = [onIdentity({ pid: child.pid ?? null, cliVersion: version.stdout.trim(), workDirectory: cwd,ownership:'live-child-handle' }).catch(error => { identityError = error; stop(); })];
  let escalation;
  function kill(sig) { if (settled || !child.pid) return; try { platform.terminate(child, sig); } catch (error) { if (error.code !== 'ESRCH') parseError ??= fail('AI_EXECUTION_UNKNOWN', '受管进程停止状态未知。', { outcomeUnknown: true }); } }
  function stop() { kill('SIGTERM'); escalation = setTimeout(() => kill('SIGKILL'), 1500); }
  const aborted = () => stop(); signal?.addEventListener('abort', aborted, { once: true });
  if (signal?.aborted) stop();
  child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => {
    total += Buffer.byteLength(chunk);
    if (total > 4 * 1024 * 1024) { parseError ??= fail('AI_OUTPUT_INVALID', 'CLI 事件流超过上限。'); stop(); return; }
    line += chunk;
    while (line.includes('\n')) {
      const at = line.indexOf('\n'), text = line.slice(0, at); line = line.slice(at + 1); if (!text.trim()) continue;
      let event; try { event = JSON.parse(text); } catch { parseError ??= fail('AI_CLI_PROTOCOL_INVALID', 'CLI 事件不是有效 JSONL。'); continue; }
      // Persist only execution identity and completion usage. Never save raw
      // events, tool output, reasoning, stderr or the model's internal trace.
      if (event.type === 'thread.started' && !threadId && typeof event.thread_id === 'string' && event.thread_id.length<=128){threadId = event.thread_id;identities.push(onIdentity({nativeSessionId:threadId}).catch(error=>{identityError=error;stop();}));}
      if (event.type === 'turn.completed') { completed = true; usage = event.usage ? { inputTokens: event.usage.input_tokens ?? null, outputTokens: event.usage.output_tokens ?? null, source: 'codex', cost: null } : null; }
      if (['turn.failed', 'error'].includes(event.type)) parseError ??= fail('AI_CLI_FAILED', 'Codex 执行失败，请检查认证、模型和服务连通性。');
    }
  });
  child.stderr.on('data', () => {});
  child.stdin.on('error', () => {}); child.stdin.end(spec.prompt);
  let code;
  try { code = await new Promise((resolve, reject) => { child.on('error', () => reject(fail('AI_CLI_UNAVAILABLE', '无法启动配置的 Codex 可执行文件。'))); child.on('close', resolve); }); }
  finally { settled = true; clearTimeout(escalation); signal?.removeEventListener('abort', aborted); await Promise.all(identities); }
  if (identityError) throw identityError;
  if (signal?.aborted) throw fail('AI_EXECUTION_TIMEOUT', '受管 Codex 执行已停止。');
  if (parseError) throw parseError;
  requireAI(code === 0 && completed && !line.trim(), 'AI_CLI_FAILED', 'CLI 未正常完成或事件流不完整。');
  const stat = await lstat(finalPath).catch(() => null);
  requireAI(stat?.isFile() && !stat.isSymbolicLink() && stat.size <= spec.maxOutputBytes, 'AI_OUTPUT_INVALID', 'CLI 最终输出缺失或超过上限。');
  return { text: await readFile(finalPath, 'utf8'), usage, execution: { cliVersion: version.stdout.trim(), nativeSessionId: threadId ?? null, exitCode: code } };
}
