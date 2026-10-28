import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createCoordinator } from '../services/workbench-common.js';
import { createAIStore, atomicJSON, readJSON } from './store.js';
import { readConfig, writeConfig, connectionContract, profileContract } from './profiles.js';
import { registerMaterial, materialSnapshot } from './materials.js';
import { requestContract, outputValue, canonical, clone, sha256, requireAI, fail, terminal, identifier } from './schema.js';

// Only the managed service bridge constructs caller. User parameters are never
// spread into it; trusted application code is still not an OS security boundary.
export function createAITaskService(root, { executors = {}, now = Date.now, pollMs = 250, env = process.env } = {}) {
  const coordinator = createCoordinator(), active = new Map();
  let store, starting, timer, closing = false, startupError;
  const iso = () => new Date(now()).toISOString();
  function event(task, type) { task.revision++; task.events.push({ seq: task.revision, type, status: task.status, at: iso() }); task.timestamps.updatedAt = iso(); }
  function view(task) {
    return clone({ aiTaskId: task.aiTaskId, application:task.caller,status: task.status, revision: task.revision, context: task.request.context ?? {}, output: task.output ?? null, warnings: task.warnings, timestamps: task.timestamps, usage: task.usage ?? null, error: task.error ?? null, execution: { executorId: task.snapshot.connection.id, profileId: task.request.profileId, profileRevision: task.snapshot.profileRevision, connectionRevision: task.snapshot.connectionRevision, model: task.snapshot.profile.model ?? null, attempts: task.attempts } });
  }
  async function start() {
    requireAI(!closing, 'AI_SERVICE_STOPPED', 'AI 服务已停止。');
    if (!starting) starting = (async () => {
      store = await createAIStore(root);
      const keys = new Set();
      for (const task of store.tasks.values()) {
        const key = canonical([task.appId, task.request.idempotencyKey]);
        requireAI(!keys.has(key), 'AI_STORAGE_INVALID', '存在重复幂等记录，拒绝派发。'); keys.add(key);
        if (task.status === 'running') { const next = clone(task); next.status = 'reconciling'; next.error = { code: 'AI_EXECUTION_UNKNOWN', message: '服务恢复，原执行需核对；不会自动重复执行。', outcomeUnknown: true }; event(next, 'recovery-required'); await store.save(next); }
        if (task.status === 'succeeded') {
          const artifact = await readJSON(join(store.home, 'results', task.aiTaskId + '.json'));
          requireAI(artifact.schemaVersion === 1 && sha256(canonical(artifact.value)) === task.output.artifacts[0].sha256, 'AI_STORAGE_INVALID', '成功结果缺失或摘要不匹配；已停止派发。');
        }
      }
      timer = setInterval(() => { void tick().catch(error => { startupError = error; }); }, pollMs); timer.unref();
    })().catch(error => { startupError = error; throw error; });
    await starting;
    if (startupError) throw startupError;
  }
  function own(caller, id) { identifier(id); const task = store.tasks.get(id); requireAI(task && task.appId === caller.appId, 'AI_TASK_NOT_FOUND', '任务不存在或不属于此应用。', { status: 404 }); return task; }
  function callerCheck(caller) { requireAI(caller && typeof caller.appId === 'string' && caller.appId.length > 0, 'AI_CALLER_INVALID', '缺少受管应用身份。', { status: 403 }); }
  async function submit(caller, input) {
    callerCheck(caller); const request = requestContract(input); await start();
    const result = await coordinator.run('state', async () => {
      const requestDigest = sha256(canonical(request));
      const existing = [...store.tasks.values()].find(task => task.appId === caller.appId && task.request.idempotencyKey === request.idempotencyKey);
      if (existing) { requireAI(existing.requestDigest === requestDigest, 'AI_IDEMPOTENCY_CONFLICT', '相同幂等键对应不同请求。', { status: 409 }); return view(existing); }
      const profiles = await readConfig(store.home, 'profiles'), connections = await readConfig(store.home, 'connections');
      const configured = profiles.items.find(item => item.id === request.profileId);
      requireAI(configured?.enabled, 'AI_PROFILE_UNAVAILABLE', '执行配置不存在或已停用。');
      const profile = profileContract(configured), configuredConnection = connections.items.find(item => item.id === profile.executorId);
      requireAI(configuredConnection?.enabled, 'AI_PROFILE_UNAVAILABLE', '执行连接不存在或已停用。');
      const connection = connectionContract(configuredConnection), kind = connection.kind === 'codex' ? 'codex' : connection.protocolId;
      requireAI(executors[kind], 'AI_CAPABILITY_UNSUPPORTED', '此执行适配器未安装。');
      const capabilities = kind === 'openai-transcription-v1' ? ['audio-transcription', 'json'] : ['text', 'json'];
      requireAI((request.requirements ?? []).every(item => capabilities.includes(item)), 'AI_CAPABILITY_UNSUPPORTED', '执行连接不支持任务要求。');
      requireAI(connection.kind !== 'api' || profile.model, 'AI_PROFILE_UNAVAILABLE', 'API 执行配置需要明确模型。');
      for (const [key, limit] of Object.entries(request.limits ?? {})) requireAI(Number.isSafeInteger(limit) && limit > 0 && limit <= profile[key], 'AI_REQUEST_INVALID', '任务限制只能收紧配置。');
      Object.assign(profile, request.limits);
      const materials = []; let bytes = Buffer.byteLength(request.instruction);
      for (const input of request.inputs) { if (input.kind === 'material') { const material = await materialSnapshot(store, caller, input); materials.push(material); bytes += material.size; } else bytes += Buffer.byteLength(input.text); }
      requireAI(bytes <= profile.maxInputBytes, 'AI_INPUT_TOO_LARGE', '输入超过当前执行配置上限。');
      const task = { schemaVersion: 1, aiTaskId: randomUUID(), appId: caller.appId, caller: clone(caller), request, requestDigest, snapshot: { profile, connection, profileRevision: profiles.revision, connectionRevision: connections.revision, materials }, status: 'queued', revision: 0, attempts: [], events: [], warnings: [], timestamps: { receivedAt: iso(), updatedAt: iso() } };
      event(task, 'accepted'); await store.save(task); return view(task);
    });
    queueMicrotask(() => { void tick().catch(error => { startupError = error; }); }); return result;
  }
  async function describe(caller){callerCheck(caller);await start();const profiles=await readConfig(store.home,'profiles'),connections=await readConfig(store.home,'connections');return {contractVersion:'ai-task-v1',limits:{requestBytes:768*1024,textMaterialBytes:512*1024,uploadBytes:128*1024*1024},profiles:profiles.items.filter(profile=>profile.enabled&&connections.items.some(c=>c.id===profile.executorId&&c.enabled&&executors[c.kind==='codex'?'codex':c.protocolId])).map(profile=>{const connection=connections.items.find(c=>c.id===profile.executorId);return {id:profile.id,model:profile.model??null,capabilities:connection.protocolId==='openai-transcription-v1'?['audio-transcription','json']:['text','json'],limits:{maxInputBytes:profile.maxInputBytes,maxOutputBytes:profile.maxOutputBytes,timeoutMs:profile.timeoutMs,maxAttempts:profile.maxAttempts}};})};}
  async function get(caller, id) { callerCheck(caller); await start(); return view(own(caller, id)); }
  async function readResult(caller,id){callerCheck(caller);await start();const task=own(caller,id);requireAI(task.status==='succeeded','AI_RESULT_UNAVAILABLE','任务尚无可采用的成功结果。');const artifact=await readJSON(join(store.home,'results',id+'.json'));requireAI(artifact.schemaVersion===1&&artifact.aiTaskId===id&&sha256(canonical(artifact.value))===task.output.artifacts[0].sha256,'AI_STORAGE_INVALID','结果摘要校验失败。');return{resultId:id,format:artifact.format,value:artifact.value,sha256:task.output.artifacts[0].sha256};}
  async function adminGet(id){identifier(id);await start();const task=store.tasks.get(id);requireAI(task,'AI_TASK_NOT_FOUND','任务不存在。',{status:404});return view(task);}
  async function events(caller, id, afterSeq = 0) { callerCheck(caller); await start(); requireAI(Number.isSafeInteger(afterSeq) && afterSeq >= 0, 'AI_REQUEST_INVALID', '事件游标无效。'); const task = own(caller, id); const items = task.events.filter(e => e.seq > afterSeq).slice(0, 100); return { events: clone(items), afterSeq: items.at(-1)?.seq ?? afterSeq, hasMore:task.events.some(e=>e.seq>(items.at(-1)?.seq??afterSeq)), snapshot: view(task) }; }
  async function cancel(caller, id) {
    callerCheck(caller); await start();
    const result = await coordinator.run('state', async () => { const task = clone(own(caller, id)); if (!terminal(task.status)) { task.status = 'cancelled'; task.output = null; task.timestamps.cancelRequestedAt = iso(); task.timestamps.finishedAt = iso(); event(task, 'cancelled'); await store.save(task); } return view(task); });
    active.get(id)?.controller.abort('cancelled'); return result;
  }
  function expired(task) { return task.request.deadlineAt && Date.parse(task.request.deadlineAt) <= now(); }
  async function updateAttempt(id, attemptId, patch) {
    return coordinator.run('state', async () => { const current = store.tasks.get(id); if (current.attempts.at(-1)?.attemptId !== attemptId) return; const next = clone(current); Object.assign(next.attempts.at(-1), patch); event(next, 'execution-identity'); await store.save(next); });
  }
  async function execute(id, attemptId, controller, recovered) {
    const initial = store.tasks.get(id), profile = initial.snapshot.profile;
    const remaining = initial.request.deadlineAt ? Date.parse(initial.request.deadlineAt) - now() : Infinity;
    const timeout = setTimeout(() => controller.abort('timeout'), Math.max(1, Math.min(profile.timeoutMs, remaining)));
    const executor = executors[initial.snapshot.connection.kind === 'codex' ? 'codex' : initial.snapshot.connection.protocolId];
    let result, error;
    try { result = recovered ? await recovered.read() : await executor.execute({ task: clone(initial), attemptId, store, signal: controller.signal, env, record: patch => updateAttempt(id, attemptId, patch) }); }
    catch (caught) { error = caught; }
    finally { clearTimeout(timeout); }
    await coordinator.run('state', async () => {
      const current = store.tasks.get(id); if (current.attempts.at(-1)?.attemptId !== attemptId) return;
      const next = clone(current), attempt = next.attempts.at(-1);
      attempt.finishedAt = iso(); attempt.stopConfirmed = !error?.outcomeUnknown; attempt.executionOutcome = error?.outcomeUnknown ? 'unknown' : error ? 'failed' : 'completed';
      if (terminal(next.status)) { event(next, 'late-execution-settled'); await store.save(next); return; }
      if (!error && !controller.signal.aborted && !expired(next)) {
        try {
          const value = outputValue(result.text, next.request.outputSpec, profile.maxOutputBytes);
          const artifact = { schemaVersion: 1, aiTaskId: id, attemptId, format: next.request.outputSpec.format, value };
          await atomicJSON(join(store.home, 'results', id + '.json'), artifact);
          next.output = { format: next.request.outputSpec.format, value, artifacts: [{ resultId: id, sha256: sha256(canonical(value)) }] };
          next.usage = result.usage ?? null;next.warnings = result.warnings ?? []; Object.assign(attempt, result.execution ?? {}); next.status = 'succeeded'; next.error = null;
        } catch (caught) { error = caught; }
      }
      if (next.status !== 'succeeded') {
        if (expired(next)) error = fail('AI_DEADLINE_EXCEEDED', '任务已超过总截止时间。', { outcomeUnknown: error?.outcomeUnknown });
        else if (controller.signal.aborted && !error) error = fail('AI_EXECUTION_TIMEOUT', '执行超过时限。');
        error ??= fail('AI_OUTPUT_INVALID', '执行未产生可采用结果。');
        next.error = { code: error.code?.startsWith('AI_') ? error.code : 'AI_EXECUTION_FAILED', message: error.code?.startsWith('AI_') ? error.message : '执行失败，请检查连接及认证。', outcomeUnknown: !!error.outcomeUnknown };
        attempt.errorCode = next.error.code;
        if (error.outcomeUnknown) next.status = 'reconciling';
        else if (error.retryable && next.attempts.length < profile.maxAttempts && !expired(next) && !closing) { next.status = 'retry_wait'; next.retryAt = now() + profile.retryDelayMs; }
        else next.status = 'failed';
      }
      if (terminal(next.status)) next.timestamps.finishedAt = iso();
      event(next, next.status); await store.save(next);
    });
  }
  async function tick() {
    if (closing || !store || startupError) return;
    await coordinator.run('dispatch', async () => {
      for (const saved of store.tasks.values()) {
        if (closing) return;
        if (active.has(saved.aiTaskId)) continue;
        const attempt = saved.attempts.at(-1);
        if (attempt && !attempt.stopConfirmed && (saved.status === 'reconciling' || terminal(saved.status))) {
          const executor = executors[saved.snapshot.connection.kind === 'codex' ? 'codex' : saved.snapshot.connection.protocolId];
          const recovered = await executor?.recover?.({ task: clone(saved), attemptId: attempt.attemptId, store });
          if (recovered?.settled) {
            const controller = new AbortController(), entry = { controller }; active.set(saved.aiTaskId, entry);
            entry.promise = execute(saved.aiTaskId, attempt.attemptId, controller, recovered).catch(error => { startupError = error; }).finally(() => active.delete(saved.aiTaskId));
          }else if(saved.status==='reconciling'&&expired(saved)){
            await coordinator.run('state',async()=>{const next=clone(store.tasks.get(saved.aiTaskId));if(next.status!=='reconciling')return;next.status='failed';next.error={code:'AI_DEADLINE_EXCEEDED',message:'任务已截止，原执行停止状态仍待核对。',outcomeUnknown:true};next.timestamps.finishedAt=iso();event(next,'deadline');await store.save(next);});
          }
          continue;
        }
        if (!['queued', 'retry_wait'].includes(saved.status)) continue;
        if (saved.status === 'retry_wait' && saved.retryAt > now() && !expired(saved)) continue;
        const connection = saved.snapshot.connection;
        // Unknown remote/CLI outcomes keep the execution slot, including after
        // cancellation, until an explicit reconciliation confirms settlement.
        const occupied = [...store.tasks.values()].filter(task => task.snapshot.connection.id === connection.id && task.attempts.at(-1) && !task.attempts.at(-1).stopConfirmed).length;
        if (occupied >= connection.concurrency && !expired(saved)) continue;
        let launch;
        await coordinator.run('state', async () => {
          const task = clone(store.tasks.get(saved.aiTaskId)); if (!['queued', 'retry_wait'].includes(task.status)) return;
          if (expired(task)) { task.status = 'failed'; task.error = { code: 'AI_DEADLINE_EXCEEDED', message: '任务在派发前已截止。', outcomeUnknown: false }; task.timestamps.finishedAt = iso(); event(task, 'deadline'); await store.save(task); return; }
          task.status = 'running'; task.error = null; task.timestamps.startedAt ??= iso();
          const attemptId = randomUUID(); task.attempts.push({ attemptId, startedAt: iso(), stopConfirmed: false, executionOutcome: 'running' }); event(task, 'dispatched'); await store.save(task); launch = { id: task.aiTaskId, attemptId };
        });
        if (launch) {
          const controller = new AbortController(); const entry = { controller }; active.set(launch.id, entry);
          entry.promise = execute(launch.id, launch.attemptId, controller).catch(error => { startupError = error; }).finally(() => { active.delete(launch.id); });
        }
      }
    });
  }
  async function config(kind, input) { requireAI(['connections', 'profiles'].includes(kind), 'AI_REQUEST_INVALID', '未知配置类型。'); await start(); return coordinator.run('state', () => input === undefined ? readConfig(store.home, kind) : writeConfig(store.home, kind, input)); }
  async function inspect() { await start(); return { tasks: [...store.tasks.values()].sort((a, b) => b.timestamps.receivedAt.localeCompare(a.timestamps.receivedAt)).slice(0, 100).map(view), connections: await readConfig(store.home, 'connections'), profiles: await readConfig(store.home, 'profiles') }; }
  async function checkConnection(id){identifier(id);await start();const connection=(await readConfig(store.home,'connections')).items.find(item=>item.id===id);requireAI(connection,'AI_PROFILE_UNAVAILABLE','连接不存在。');const executor=executors[connection.kind==='codex'?'codex':connection.protocolId];requireAI(executor?.check,'AI_CAPABILITY_UNSUPPORTED','适配器不提供连接检查。');return executor.check({connection,env});}
  async function register(caller, metadata, text) { callerCheck(caller); requireAI(typeof text === 'string' && Buffer.byteLength(text) <= 512 * 1024, 'AI_INPUT_TOO_LARGE', 'RPC 材料仅支持 512 KiB 文本；录音请用流式入口。'); await start(); return registerMaterial(store, caller, [Buffer.from(text)], metadata); }
  async function upload(caller, metadata, stream) { callerCheck(caller); await start(); return registerMaterial(store, caller, stream, metadata); }
  async function close() {
    if (closing) return; closing = true; clearInterval(timer);
    if (!starting) return; await starting.catch(() => {});
    await coordinator.run('dispatch', async () => {});
    for (const entry of active.values()) entry.controller.abort('shutdown');
    await Promise.allSettled([...active.values()].map(entry => entry.promise));
    await store?.close();
  }
  return { start, describe, submit, get, readResult,adminGet,cancel, events, config, inspect, checkConnection,register, upload, close, tick };
}
