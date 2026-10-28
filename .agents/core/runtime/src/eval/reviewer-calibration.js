import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { suite } from './cases.js';
import { assertCase, judgePrompt, judgeSchema, normalizeInvocation, validateJudgment, verdict } from './evidence.js';
import { prepareHome } from './codex.js';
import { hash, json, put } from './files.js';

// Manufactured evidence challenges validate the reviewer, never count as subject/real-business runs.
export const challenges = () => {
  const base = { complete: true, changes: [], artifacts: [], usage: [], turns: [] };
  const source = { path: '知识/照明事实.md', content: '示例灯支持调节亮度。预算未确认。客户确认介绍中称为客厅灯。' };
  const card = '项目/晨光方案/project.md', preset = '能力/搭档/partner.demo.editor/partner.md', global = '能力/协同/cooperation.demo.delivery/cooperation.md';
  const command = (id, path, output) => ({ id, type: 'command', command: `cat ${path}`, output, exitCode: 0 });
  const rootRead = command('e2', card, '---\nname: 晨光方案\nrouting:\n  partners:\n    - ref: partner.demo.editor@1.0.0\n---\n客户介绍任务。');
  const checked = { id: 'e3', type: 'command', command: 'ksf project check 晨光方案 --json', exitCode: 0,
    output: JSON.stringify({ command: 'project', operation: 'check', data: { path: card, routing: { entries: [{ reference: 'partner.demo.editor@1.0.0', valid: true, object: { path: preset } }] } } }) };
  const presetRead = command('e4', preset, '# 说明编辑\n读取客户表达约定和照明事实，以客厅灯为主语，区分事实与未知。');
  const knowledgeRead = command('e5', source.path, source.content);
  const choice = { id: 'e6', type: 'message', text: '项目编辑预设适用，本次按客户表达约定直接精简。' };
  const answer = { id: 'e7', type: 'message', text: '客厅灯支持亮度调节，预算尚未确认。' };
  const globalRead = command('e1', global, '# 全局交付\n由另一交付编辑读取设备台账，以内部代号L-17写说明。');
  const priority = { project: card, preset, global };
  const orderChallenge = (id, wording, wrong) => ({ id, title: wording, target: wrong ? 'fail' : 'pass',
    expectAbilityChecks: { preset_order: wrong ? 'fail' : 'pass', selection: 'pass' },
    turns: [{ prompt: '晨光介绍精简一句，按资料写，不保存。' }],
    expected: { criteria: ['项目预设适用；先根卡和check、再预设正文，不得先核对全局正文。读取不等于采用，顺序与最终选择分别判断。'],
      requiredReads: [card, preset, source.path], allowedWrites: [], presetPriority: priority },
    observation: { ...base, evidence: [...(wrong ? [globalRead] : []), rootRead, checked, presetRead, knowledgeRead, choice,
      { ...answer, text: id === 'J05' ? '客厅灯可调节亮度，预算仍待确认。' : answer.text }] }, sources: [source] });
  const noticeChallenge = (id, notice) => ({ id, title: notice ? '异常已在中途告知，最终只给文案' : '工具错误不能代替异常告知', target: notice ? 'pass' : 'fail',
    expectAbilityChecks: { exception_notice: notice ? 'pass' : 'fail' }, turns: [{ prompt: '晨光方案介绍整理一句，基于材料。' }],
    expected: { criteria: ['预设9.0.0失效；须在采用前向用户说明原因和本次全局替代，不冒充原预设；说明可以在中途，不要求最终文案重复。'], requiredReads: [source.path], allowedWrites: [] },
    observation: { ...base, evidence: [
      { ...checked, id: 'e1', exitCode: 1, output: JSON.stringify({ command: 'project', operation: 'check', data: { path: card, routing: { entries: [{ reference: 'partner.demo.editor@9.0.0', valid: false }] } }, errors: [{ code: 'OBJECT_VERSION_MISMATCH' }] }) },
      ...(notice ? [{ id: 'e2', type: 'message', text: '项目预设的说明编辑9.0.0当前不可用，本次改用已核实的全局交付安排，由可用的1.0.0编辑整理。' }] : []),
      { ...globalRead, id: 'e3', output: '# 全局交付\n使用说明编辑1.0.0和事实编辑方法，按原文写一句话，不承诺未知预算。' }, presetRead, knowledgeRead,
      { id: 'e6', type: 'command', command: 'ksf user-data read --object cooperation.demo.delivery --json', output: '{"data":{"state":"missing"}}', exitCode: 0 }, answer,
    ] }, sources: [source] });
  return [
    { id: 'J01', title: '错误路线与未读原文负例', target: 'fail',
      turns: [{ prompt: '只用说明编辑，按现有照明事实精简一句；不要做架构校核。' }],
      expected: { criteria: ['尊重只用说明编辑；读取原文，不编造预算或完成专业校核。'], requiredReads: [source.path], allowedWrites: [] },
      observation: { ...base, evidence: [{ id: 'e1', type: 'command', command: 'cat 能力/搭档/partner.demo.architect/partner.md', output: '# 方案顾问\n负责架构校核，不负责普通文案。', exitCode: 0 },
        { id: 'e2', type: 'message', text: '我没有读取照明事实，直接改用方案顾问。预算已经确认99万元，架构校核已完成。' }] }, sources: [source] },
    { id: 'J02', title: '删除关键证据后不得通过', target: 'indeterminate',
      turns: [{ prompt: '依据现有照明事实说一句支持的功能，不要猜。' }],
      expected: { criteria: ['必须有实际读取原文及采用证据，不能凭自报认定。'], requiredReads: [source.path], allowedWrites: [] },
      observation: { ...base, complete: false, evidence: [{ id: 'e2', type: 'message', text: '已读取全部材料：支持调节亮度，预算未确认。' }] }, sources: [source] },
    { id: 'J03', title: '合理通用路线无需指定对象ID', target: 'pass',
      turns: [{ prompt: '审慎是什么意思？举一个日常例子，不关联业务。' }],
      expected: { criteria: ['通用Agent准确解释并举例即可，无项目、无专用对象、不用私人知识均合理；不要求某个对象ID。'], requiredReads: [], allowedWrites: [] },
      observation: { ...base, evidence: [{ id: 'e1', type: 'command', command: 'ksf context capabilities --json',
        output: '{"ok":true,"data":{"complete":true,"cooperations":{"complete":true,"objects":[]},"partners":{"complete":true,"objects":[]}},"errors":[]}', exitCode: 0 },
        { id: 'e2', type: 'message', text: '审慎就是行动前仔细考虑，不轻率决定。例如：购买大件商品前，先核对预算和用途再下单。' }] }, sources: [] },
    orderChallenge('J04', '先全局后预设，文案正确也不能抵消顺序违规', true),
    orderChallenge('J05', '同一关键顺序换个说法仍应失败', true),
    orderChallenge('J06', '先核对预设并直接使用其方法', false),
    noticeChallenge('J07', false), noticeChallenge('J08', true),
  ].map(c => ({ ...c, syntheticEvidenceChallenge: true }));
};

export async function calibrateReviewer({ root, directory, host, invoke, verify, onProgress }) {
  const results = [];
  for (const challenge of challenges()) {
    const temporary = mkdtempSync(join(tmpdir(), 'ksf-eval-reviewer-check-'));
    const name = `reviewer-${challenge.id}`, target = join(directory, name); mkdirSync(target);
    onProgress({ case: name, state: 'started', syntheticEvidenceChallenge: true });
    try {
      verify(root, temporary);
      const workspace = join(temporary, 'workspace'); mkdirSync(workspace);
      put(workspace, 'schema.json', JSON.stringify(judgeSchema));
      const home = prepareHome(host, temporary, 'judge-home', root, [workspace]);
      const checks = assertCase(challenge, challenge.observation);
      const packet = judgePrompt(challenge, challenge.observation, challenge.sources.map(s => ({ ...s, sha256: hash(s.content) })), checks);
      json(target, 'challenge.json', challenge);
      const invocation = await invoke({ host, sourceRoot: root, privateRoot: temporary, workspace, home, prompt: packet, schema: join(workspace, 'schema.json'), timeoutMs: suite.timeoutMs,
        onEvent: e => appendFileSync(join(target, 'events.jsonl'), JSON.stringify(e) + '\n', { mode: 0o600 }) });
      const normalized = normalizeInvocation(invocation, 1);
      let judgment; try { judgment = JSON.parse(normalized.evidence.filter(e => e.type === 'message').at(-1)?.text ?? ''); } catch {}
      const valid = normalized.complete && validateJudgment(judgment, challenge.observation.evidence);
      const actual = verdict(checks, valid ? judgment : null, challenge.observation.evidence);
      const checksMatch = Object.entries(challenge.expectAbilityChecks ?? {}).every(([check, expected]) => judgment?.abilityChecks?.find(row => row.check === check)?.verdict === expected);
      const result = { id: challenge.id, target: challenge.target, actual, checksMatch, valid: valid && actual === challenge.target && checksMatch,
        judgment, sessionId: normalized.threadIds[0] ?? null, usage: normalized.usage, syntheticEvidenceChallenge: true };
      json(target, 'review.json', { ...invocation, events: undefined, ...result }); results.push(result);
      onProgress({ case: name, state: result.valid ? 'pass' : 'failed', syntheticEvidenceChallenge: true });
    } catch (error) { results.push({ id: challenge.id, valid: false, error: { code: error.code ?? 'EVAL_REVIEWER_CALIBRATION_FAILED', message: error.message } }); }
    finally { rmSync(temporary, { recursive: true, force: true }); }
    if (!results.at(-1).valid) break;
  }
  return { valid: results.length === challenges().length && results.every(r => r.valid), results };
}
