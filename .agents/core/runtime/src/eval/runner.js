import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { suite, selection, validateSuite } from './cases.js';
import { freezeInstance, materialize } from './snapshot.js';
import { inspectHost, publicHost, verifyGuard, prepareHome, invokeCodex, removeHome } from './codex.js';
import { assertCase, judgePrompt, judgeSchema, normalizeInvocation, verdict, validateJudgment, readProof, abilityChecks } from './evidence.js';
import { businessFiles, changes, copyTree, fail, hash, inventory, json, put, regularFile } from './files.js';
import { calibrateReviewer } from './reviewer-calibration.js';
import { loadCases } from './instance-cases.js';
import { prepareReviewPacket } from './review-packet.js';

const reportRoot = root => join(root, '.agents/runtime-data/verification');
export function checkRouting(root, { inspect = inspectHost, verify = verifyGuard } = {}) {
  const validated = validateSuite(), errors = validated.errors.map(message => ({ code: 'EVAL_SUITE_INVALID', message }));
  let host = null, guard = null;
  const temporary = mkdtempSync(join(tmpdir(), 'ksf-eval-check-'));
  try {
    host = inspect(); guard = verify(root, temporary); loadCases(root);
    for (const p of ['AGENTS.md', '.agents/ksf', '.agents/core/runtime/src/cli.js'])
      if (!existsSync(join(root, p))) errors.push({ code: 'EVAL_FIXTURE_MISSING', message: `Required instance material is unavailable: ${p}` });
  } catch (error) { errors.push({ code: error.code ?? 'EVAL_CHECK_FAILED', message: error.message }); }
  finally { rmSync(temporary, { recursive: true, force: true }); }
  return { valid: !errors.length, suite: { id: suite.id, version: suite.version, cases: suite.cases.length,
    calibration: selection('calibration').length, coreExecutions: selection('core').length }, host: host && publicHost(host), guard, errors };
}

export function readRun(root, id) {
  if (!/^routing-\d{8}T\d{6}Z-[a-f0-9]{8}$/.test(id)) fail('EVAL_RUN_ID_INVALID', 'Expected an exact routing run ID.');
  const path = join(reportRoot(root), id, 'report.json');
  if (!existsSync(path)) fail('EVAL_RUN_NOT_FOUND', 'No saved report for this run ID.');
  return JSON.parse(readFileSync(path, 'utf8'));
}
function gate(root, materialDigest, host) {
  const candidates = existsSync(reportRoot(root)) ? readdirSync(reportRoot(root)).filter(n => /^routing-/.test(n)).sort().reverse() : [];
  for (const id of candidates) {
    let report; try { report = readRun(root, id); } catch { continue; }
    if (report.profile === 'calibration' && report.calibrationReady && report.materialDigest === materialDigest &&
      report.suiteVersion === suite.version && JSON.stringify(report.host) === JSON.stringify(publicHost(host))) return id;
  }
  return null;
}
function summary(results, planned) {
  const count = key => Object.fromEntries([...new Set(results.map(r => r[key]))].map(value => [value, results.filter(r => r[key] === value).length]));
  return { planned, recorded: results.length, notRun: planned - results.length, runStatus: count('runStatus'), reviewStatus: count('reviewStatus'), verdict: count('verdict'),
    observedUsage: results.flatMap(r => r.usage ?? []), pricing: 'unknown; no price or cross-provider cost is inferred' };
}
function markdown(report) {
  return `# KSF 自然语言路由评测\n\n运行：${report.runId}\n\n配置：${report.host.version} / ${report.host.model} / ${report.host.reasoningEffort ?? '宿主默认'}\n\n` +
    `Profile：${report.profile}；计划 ${report.summary.planned} 例次，已记录 ${report.summary.recorded}，未运行 ${report.summary.notRun}。\n\n` +
    `验收：${JSON.stringify(report.summary.verdict)}；运行状态：${JSON.stringify(report.summary.runStatus)}；评审状态：${JSON.stringify(report.summary.reviewStatus)}。\n\n` +
    '| 案例 | 重复 | 运行状态 | 评审状态 | 结论 | 证据 |\n| --- | --- | --- | --- | --- | --- |\n' +
    report.results.map(r => `| ${r.id} ${r.title} | ${r.repetition} | ${r.runStatus} | ${r.reviewStatus} | ${r.verdict} | [记录](${r.directory}/result.json) |`).join('\n') +
    '\n\n通过只对应本次宿主、配置和材料；独立CLI会话不是桌面会话或跨宿主验收。模型评审不是人工确认，争议与证据缺口保留待复核。未改生产路由规则。\n';
}

export async function runRouting(root, profile, { invoke = invokeCodex, inspect = inspectHost, verify = verifyGuard, onProgress = () => {} } = {}) {
  const checked = checkRouting(root, { inspect, verify });
  if (!checked.valid) fail('EVAL_PRECHECK_FAILED', checked.errors.map(e => `${e.code}: ${e.message}`).join('\n'));
  const host = inspect(), cases = loadCases(root), plans = selection(profile, cases);
  const runId = `routing-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}-${randomUUID().slice(0, 8)}`;
  const directory = join(reportRoot(root), runId); mkdirSync(directory, { recursive: true, mode: 0o700 });
  const manifest = freezeInstance(root, join(directory, 'frozen'));
  for (const p of ['.agents/core/runtime/src/eval', '.agents/core/runtime/src/commands/eval.js']) copyTree(join(root, p), join(directory, 'apparatus', p));
  const apparatusDigest = hash(JSON.stringify(inventory(join(directory, 'apparatus'))));
  const materialDigest = hash(JSON.stringify({ manifest, cases, apparatusDigest })); json(directory, 'snapshot.json', manifest); json(directory, 'suite.json', { ...suite, cases });
  const report = { schemaVersion: 1, runId, profile, suiteVersion: suite.version, startedAt: new Date().toISOString(), completedAt: null,
    host: publicHost(host), materialDigest, apparatusDigest, calibrationRun: null, calibrationReady: false, status: 'running', results: [], summary: summary([], plans.length) };
  const save = () => { report.summary = summary(report.results, plans.length);
    report.summary.reviewerCalibrationUsage = report.reviewerCalibration?.results.flatMap(r => r.usage ?? []) ?? [];
    json(directory, 'report.json', report); put(directory, 'report.md', markdown(report)); };
  save();
  if (profile === 'core') {
    report.calibrationRun = gate(root, materialDigest, host);
    if (!report.calibrationRun) { report.status = 'calibration_required'; report.completedAt = new Date().toISOString(); save();
      fail('EVAL_CALIBRATION_REQUIRED', `No complete calibrated run for the same source, materials, suite and host. Preserved ${runId}.`); }
  }
  const selfCheck = apparatusSelfCheck(); json(directory, 'apparatus-check.json', selfCheck);
  const sessions = new Set();
  for (const [index, contract] of plans.entries()) {
    const name = `${contract.id}-${contract.repetition}`, evidenceDir = join(directory, name);
    mkdirSync(evidenceDir, { recursive: true, mode: 0o700 });
    json(evidenceDir, 'contract.json', contract); // test side only, outside the guarded subject workspace
    onProgress({ runId, index: index + 1, total: plans.length, case: name, state: 'started' });
    const result = { id: contract.id, title: contract.title, repetition: contract.repetition, directory: name,
      runStatus: 'harness_error', reviewStatus: 'not_run', verdict: 'indeterminate', usage: [], error: null };
    let privateRoot;
    try {
      privateRoot = mkdtempSync(join(tmpdir(), 'ksf-eval-session-'));
      const workspace = join(privateRoot, 'workspace'), initial = materialize(join(directory, 'frozen'), workspace, contract, manifest);
      for (const p of contract.expected.requiredReads) if (!regularFile(workspace, p) && !contract.turns.some(t => Object.hasOwn(t.inject ?? {}, p)))
        fail('EVAL_FIXTURE_MISSING', `Required material was not safely copied into the subject snapshot: ${p}`);
      for (const group of contract.expected.requiredReadGroups ?? []) if (!group.some(p => regularFile(workspace, p))) fail('EVAL_FIXTURE_MISSING', 'No safely copied source in an alternative-read group.');
      const guard = verify(root, privateRoot, workspace); json(evidenceDir, 'initial.json', { files: initial, guard });
      let home = prepareHome(host, privateRoot, 'subject-home-1', root), sessionId;
      const subjectHomes = new Set([home]);
      const observation = { evidence: [], changes: [], complete: true, usage: [], turns: [], artifacts: [], readProofs: {} };
      const subjectDeadline = Date.now() + suite.timeoutMs;
      for (const [turnIndex, turn] of contract.turns.entries()) {
        if (turn.inject) for (const [path, content] of Object.entries(turn.inject)) put(workspace, path, content);
        for (const path of new Set(['.agents/core/abilities/partners/ksf-runtime/partner.md', '.agents/core/abilities/competencies/ability-route/competency.md', ...contract.expected.requiredReads, ...(contract.expected.requiredReadGroups ?? []).flat(), ...(contract.expected.forbiddenReads ?? []), ...Object.values(contract.expected.presetPriority ?? {})])) {
          if (regularFile(workspace, path)) {
            observation.readProofs[path] = readProof(readFileSync(join(workspace, path), 'utf8'));
          }
        }
        if (turn.fresh) {
          removeHome(home); // Fresh recovery must not expose the prior host's auth, history or rollouts.
          home = prepareHome(host, privateRoot, `subject-home-${turnIndex + 1}`, root); subjectHomes.add(home); sessionId = undefined;
        }
        const before = inventory(workspace, businessFiles);
        let replayedPrompt = turn.prompt;
        for (const mapping of manifest.mappings) replayedPrompt = replayedPrompt.replaceAll(mapping.from, join(workspace, mapping.to));
        const invocation = await invoke({ host, sourceRoot: root, privateRoot, workspace, home, prompt: replayedPrompt, sessionId,
          timeoutMs: Math.max(1, subjectDeadline - Date.now()),
          onEvent: event => appendFileSync(join(evidenceDir, `turn-${turnIndex + 1}.jsonl`), JSON.stringify(event) + '\n', { mode: 0o600 }) });
        const normalized = normalizeInvocation(invocation, turnIndex + 1);
        json(evidenceDir, `turn-${turnIndex + 1}.json`, { ...invocation, events: undefined, normalized, prompt: turn.prompt, replayedPrompt, fresh: turnIndex === 0 || !!turn.fresh });
        observation.evidence.push(...normalized.evidence); observation.usage.push(...normalized.usage);
        observation.changes.push(...changes(before, inventory(workspace, businessFiles, { recordLinks: true })).map(c => ({ ...c, turn: turnIndex + 1 })));
        observation.turns.push({ turn: turnIndex + 1, sessionId: normalized.threadIds[0] ?? sessionId ?? null, fresh: turnIndex === 0 || !!turn.fresh, prompt: turn.prompt, replayedPrompt,
          complete: normalized.complete, timedOut: invocation.timedOut });
        if (!sessionId) {
          const actual = normalized.threadIds[0];
          if (!actual && !normalized.complete) { result.runStatus = 'infrastructure_error'; observation.complete = false; break; }
          if (!actual || sessions.has(actual)) fail('EVAL_SESSION_NOT_INDEPENDENT', 'Fresh subject sessions must return a unique session ID.');
          sessions.add(actual); sessionId = actual;
        } else if (normalized.threadIds.some(id => id !== sessionId)) fail('EVAL_SESSION_MISMATCH', 'Continuation returned a different session ID.');
        observation.complete &&= normalized.complete;
        if (!normalized.complete) { result.runStatus = invocation.timedOut && normalized.evidence.length ? 'valid' : 'infrastructure_error'; break; }
      }
      if (observation.complete) result.runStatus = 'valid';
      result.usage.push(...observation.usage);
      const sources = [];
      for (const path of new Set([...contract.expected.requiredReads, ...(contract.expected.requiredReadGroups ?? []).flat()])) if (regularFile(workspace, path)) {
        const content = readFileSync(join(workspace, path), 'utf8'); sources.push({ path, sha256: hash(content), content });
      }
      for (const path of new Set(observation.changes.filter(c => c.kind !== 'removed').map(c => c.path))) {
        if (regularFile(workspace, path)) {
          const bytes = readFileSync(join(workspace, path)); put(evidenceDir, `artifacts/${path}`, bytes);
          observation.artifacts.push({ path, sha256: hash(bytes), content: bytes.length <= 256000 ? bytes.toString('utf8') : null });
        }
      }
      json(evidenceDir, 'observation.json', observation);
      for (const subjectHome of subjectHomes) removeHome(subjectHome);
      const checks = assertCase(contract, observation); json(evidenceDir, 'assertions.json', checks);
      const judgeWorkspace = join(privateRoot, 'judge'); mkdirSync(judgeWorkspace);
      put(judgeWorkspace, 'schema.json', JSON.stringify(judgeSchema));
      const prepared = prepareReviewPacket(judgeWorkspace, contract, observation, sources, checks), packet = prepared.prompt;
      copyTree(judgeWorkspace, join(evidenceDir, 'review-input'));
      result.reviewInput = { path: 'review-input/review-input.json', externalized: prepared.externalized };
      let judgment = null;
      if (result.runStatus === 'valid' && observation.complete && packet.length <= 300000) {
        const judgeHome = prepareHome(host, privateRoot, 'judge-home', root, [judgeWorkspace, workspace]);
        const reviewed = await invoke({ host, sourceRoot: root, privateRoot, workspace: judgeWorkspace, home: judgeHome, prompt: packet,
          schema: join(judgeWorkspace, 'schema.json'), timeoutMs: Math.max(1, subjectDeadline - Date.now()),
          onEvent: event => appendFileSync(join(evidenceDir, 'judge.jsonl'), JSON.stringify(event) + '\n', { mode: 0o600 }) });
        const normalized = normalizeInvocation(reviewed, 1);
        result.usage.push(...normalized.usage);
        const judgeId = normalized.threadIds[0];
        if (judgeId && sessions.has(judgeId)) fail('EVAL_JUDGE_NOT_INDEPENDENT', 'Reviewer must be a separate new session.');
        if (judgeId) sessions.add(judgeId);
        try { judgment = JSON.parse(normalized.evidence.filter(e => e.type === 'message').at(-1)?.text ?? ''); } catch {}
        result.reviewStatus = normalized.complete && validateJudgment(judgment, observation.evidence) ? 'valid' : normalized.complete ? 'harness_error' : 'infrastructure_error';
        json(evidenceDir, 'review.json', { ...reviewed, events: undefined, sessionId: judgeId, judgment, valid: result.reviewStatus === 'valid' });
        removeHome(judgeHome);
      } else if (packet.length > 300000) { result.reviewStatus = 'harness_error'; result.error = { code: 'EVAL_REVIEW_PACKET_LIMIT', message: 'Evidence packet exceeds the lossless review limit; no silent truncation.' }; }
      result.verdict = verdict(checks, result.reviewStatus === 'valid' ? judgment : null, observation.evidence);
      result.traceComplete = observation.complete; result.checks = checks; result.judgment = judgment; result.turns = observation.turns;
    } catch (error) { result.error = { code: error.code ?? 'EVAL_HARNESS_FAILED', message: error.message }; }
    finally {
      // Credentials and host rollouts never enter the retained fixture, packet or report.
      if (privateRoot) rmSync(privateRoot, { recursive: true, force: true });
    }
    json(evidenceDir, 'result.json', result); report.results.push(result); save();
    onProgress({ runId, index: index + 1, total: plans.length, case: name, state: result.verdict, runStatus: result.runStatus, reviewStatus: result.reviewStatus });
    if (result.runStatus !== 'valid' || result.reviewStatus !== 'valid') {
      report.status = 'interrupted'; break; // Do not spend a whole batch on a broken host or apparatus.
    }
  }
  report.completedAt = new Date().toISOString();
  if (report.status === 'running') report.status = 'completed';
  if (profile === 'calibration' && report.status === 'completed') {
    report.reviewerCalibration = await calibrateReviewer({ root, directory, host, invoke, verify, onProgress });
    json(directory, 'reviewer-calibration.json', report.reviewerCalibration);
    if (!report.reviewerCalibration.valid) report.status = 'calibration_failed';
  }
  report.calibrationReady = profile === 'calibration' && selfCheck.valid && report.results.length === plans.length &&
    report.reviewerCalibration?.valid === true && report.results.every(r => r.runStatus === 'valid' && r.reviewStatus === 'valid' && r.traceComplete && r.verdict !== 'indeterminate');
  save(); return report;
}

export function apparatusSelfCheck() {
  const contract = { expected: { allowedWrites: [], requiredReads: ['知识/事实.md'] } };
  const observation = { complete: true, changes: [], evidence: [
    { id: 'e1', type: 'command', command: 'cat 知识/事实.md', output: '事实：亮度可调', exitCode: 0 }, { id: 'e2', type: 'message', text: '仅承诺亮度可调。' },
  ] };
  const judgment = { dimensions: suite.dimensions.map(dimension => ({ dimension, verdict: 'pass', explanation: '证据支持', evidence: ['e1', 'e2'] })),
    abilityChecks: abilityChecks.map(check => ({ check, verdict: 'not_applicable', explanation: '聚合程序样例不涉及预设与替代', evidence: [] })),
    interpretation: '合理替代路线也可以通过', disputes: [] };
  const grade = (o, j = judgment) => verdict(assertCase(contract, o), j, o.evidence);
  const alternative = grade(observation) === 'pass';
  const lost = { ...observation, complete: false, evidence: [observation.evidence[1]] };
  const lostJudge = { ...judgment, dimensions: judgment.dimensions.map(d => ({ ...d, evidence: ['e2'] })) };
  const cases = { alternativeAccepted: alternative, missingEvidenceNotPassed: grade(lost, lostJudge) === 'indeterminate',
    unexpectedWriteRejected: grade({ ...observation, changes: [{ path: '知识/擅自创建.md' }] }) === 'fail',
    wrongRouteNotAveraged: grade(observation, { ...judgment, dimensions: judgment.dimensions.map(d => d.dimension === 'ability' ? { ...d, verdict: 'fail' } : d) }) === 'fail',
    inventedCitationRejected: grade(observation, { ...judgment, dimensions: judgment.dimensions.map(d => ({ ...d, evidence: ['invented'] })) }) === 'indeterminate' };
  return { valid: Object.values(cases).every(Boolean), cases,
    boundary: 'Deterministic aggregation controls; independent model reviewer calibration is recorded separately in real case evidence.' };
}
