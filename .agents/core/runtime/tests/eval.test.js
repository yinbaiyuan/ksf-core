import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { suite, selection, validateSuite } from '../src/eval/cases.js';
import { businessFiles, changes, copyTree, inventory, json, put, regularFile } from '../src/eval/files.js';
import { fictional, freezeInstance, materialize } from '../src/eval/snapshot.js';
import { normalizeInvocation, assertCase, observedReads, validateJudgment, verdict, readProof, abilityChecks } from '../src/eval/evidence.js';
import { apparatusSelfCheck, checkRouting, readRun, runRouting } from '../src/eval/runner.js';
import { runEvalCommand } from '../src/commands/eval.js';
import { guardProfile, inspectHost, redact, verifyGuard } from '../src/eval/codex.js';
import { loadCases } from '../src/eval/instance-cases.js';
import { prepareReviewPacket } from '../src/eval/review-packet.js';

const temporary = t => { const root = mkdtempSync(join(tmpdir(), 'ksf-eval-unit-')); t.after(() => rmSync(root, { recursive: true, force: true })); return root; };
const passJudge = evidence => ({ dimensions: suite.dimensions.map(dimension => ({ dimension, verdict: 'pass', explanation: 'Synthetic test data only', evidence: evidence.map(e => e.id) })), abilityChecks: abilityChecks.map(check => ({ check, verdict: 'not_applicable', explanation: 'Synthetic check', evidence: [] })), interpretation: 'fixture', disputes: [] });

test('routing suite has 24 cases, two real materials, six calibration cases and eight triple repetitions', () => {
  assert.equal(suite.version, '2.0.0');
  assert.deepEqual(suite.dimensions, ['project', 'ability', 'materials', 'adoption', 'boundary']);
  assert.deepEqual(validateSuite(), { valid: true, errors: [] });
  assert.equal(suite.cases.filter(c => c.material === 'instance').length, 2);
  assert.equal(selection('calibration').length, 6); assert.equal(selection('core').length, 40);
  assert.ok(selection('core').filter(c => c.critical).every(c => [1, 2, 3].includes(c.repetition)));
  assert.ok(!validateSuite({ cases: [{ ...suite.cases[0], expected: { criteria: [], requiredReads: ['../secret'] } }] }).valid);
});

test('forbidden reads fail on observed content and remain indeterminate with missing or opaque evidence', () => {
  const path = '知识/干扰.md', text = '# 未采用\n这份候选认识不能自动用于业务。\n';
  const contract = { expected: { allowedWrites: [], requiredReads: [], forbiddenReads: [path] } };
  const observation = { complete: true, changes: [], readProofs: { [path]: readProof(text) }, evidence: [] };
  const grade = x => assertCase(contract, x).find(c => c.id === `forbidden-read:${path}`).verdict;
  assert.equal(grade({ ...observation, evidence: [{ id: 'e', type: 'command', command: `cat ${path}`, output: text, exitCode: 0 }] }), 'fail');
  assert.equal(grade({ ...observation, evidence: [{ id: 'e', type: 'command', command: 'cat 知识/*.md', output: text, exitCode: 0 }] }), 'fail');
  assert.equal(grade({ ...observation, complete: false }), 'indeterminate');
  assert.equal(grade({ ...observation, readProofs: {} }), 'indeterminate');
  assert.equal(grade({ ...observation, evidence: [{ id: 'e', type: 'command', command: 'python3 helper.py', output: '', exitCode: 0 }] }), 'indeterminate');
  assert.equal(grade({ ...observation, evidence: [{ id: 'e', type: 'command', command: 'ls 知识', output: '干扰.md', exitCode: 0 }] }), 'pass');
  const judged = passJudge(observation.evidence);
  assert.equal(verdict(assertCase(contract, { ...observation, complete: false }), judged, observation.evidence), 'indeterminate');
});

test('data-package definition reads are recognized through the real CLI spelling', () => {
  const path = '能力/数据包/data-package.demo.expression/datapackage.md';
  const evidence = [{ id: 'e', type: 'command', command: 'ksf data-package read data-package.demo.expression --json', exitCode: 0,
    output: JSON.stringify({ data: { object: { path, body: '# 资料包\n按需读取原文。' } } }) }];
  assert.deepEqual(observedReads(evidence, [path])[0].evidence, ['e']);
});

test('new fixtures expose project facts through the root card and explicitly bind supporting data', t => {
  const root = temporary(t); fictional(root, 'no-navigation');
  const card = readFileSync(join(root, '项目/晨光方案/project.md'), 'utf8');
  assert.doesNotMatch(card, /\n  knowledge:/);
  assert.match(card, /\[照明事实\]\(资料\/照明约束.md\)/);
  assert.equal(existsSync(join(root, '知识/knowledge.md')), false);
  assert.match(readFileSync(join(root, '能力/基本功/competency.demo.edit/competency.md'), 'utf8'), /data-package.demo.expression@1.0.0/);
  assert.match(readFileSync(join(root, '能力/数据包/data-package.demo.expression/datapackage.md'), 'utf8'), /知识\/表达\/用语约定.md/);
  assert.ok(existsSync(join(root, '项目/晨光方案/资料/S1.md')));
});

test('saved pre-retirement evaluation reports are read without applying current dimensions or rescoring', t => {
  const root = temporary(t), id = 'routing-20261020T000000Z-abcdef12';
  const old = { schemaVersion: 1, runId: id, suiteVersion: '1.1.0', results: [{ verdict: 'fail', judgment: { dimensions: [{ dimension: 'knowledge', verdict: 'fail' }] } }] };
  json(root, `.agents/runtime-data/verification/${id}/report.json`, old);
  assert.deepEqual(readRun(root, id), old);
});
test('evidence distinguishes actual body reads from discovery, names and unexecuted commands', () => {
  const path = '知识/事实.md', command = { id: 'e1', type: 'command', command: `cat ${path}`, output: '原文', exitCode: 0 };
  assert.deepEqual(observedReads([command], [path])[0].evidence, ['e1']);
  for (const change of [{ command: `ls ${path}` }, { command: `rg --files 知识 | rg ${path}` }, { output: '' }, { exitCode: 2 }])
    assert.deepEqual(observedReads([{ ...command, ...change }], [path])[0].evidence, []);
  assert.deepEqual(observedReads([{ ...command, command: 'ksf project read 甲 --json', output: JSON.stringify({ data: { project: { path, body: '原文' } } }) }], [path])[0].evidence, ['e1']);
});
test('verified original bytes survive an unrelated failure in a combined read command', () => {
  const path = '知识/事实.md', text = '# 原文\n明确事实\n末尾边界。';
  const proof = { [path]: readProof(text) };
  const e = { id: 'e1', type: 'command', command: `cat ${path} missing.md`, output: text + '\ncat: missing.md: No such file', exitCode: 1 };
  assert.deepEqual(observedReads([e], [path], proof)[0].evidence, ['e1']);
  assert.deepEqual(observedReads([{ ...e, output: 'cat: 知识/事实.md: No such file' }], [path], proof)[0].evidence, []);
});
test('combined listings never erase verified body reads; fixed definitions need complete bytes', () => {
  const path = '.agents/core/abilities/competencies/ability-route/competency.md';
  const text = '---\nid: test\n---\n' + '完整方法正文不能被首尾指纹代替。\n'.repeat(40), proofs = { [path]: readProof(text) };
  for (const command of [`ls -ld missing\ncat ${path}\ncat missing`, `pwd\ncat ${path}\nif test -d optional; then ls optional; fi`, `rg --files\ncat ${path}`])
    for (const exitCode of [0, 1]) assert.deepEqual(observedReads([{ id: 'e', type: 'command', command, output: text + '\ncat: missing: No such file', exitCode }], [path], proofs, { full: true })[0].evidence, ['e']);
  for (const output of [text.slice(0, 160) + '\n...\n' + text.slice(-160), path, 'cat: missing: No such file'])
    assert.deepEqual(observedReads([{ id: 'e', type: 'command', command: `cat ${path}`, output, exitCode: 0 }], [path], proofs, { full: true })[0].evidence, []);
  assert.deepEqual(observedReads([{ id: 'e', type: 'command', command: `ls ${path}`, output: text, exitCode: 0 }], [path], proofs, { full: true })[0].evidence, []);
});
test('preset body order is independent from adoption and accepts early global summaries', () => {
  const project = '项目/甲/project.md', preset = '能力/搭档/编辑/partner.md', global = '能力/协同/交付/cooperation.md';
  const contract = { expected: { allowedWrites: [], requiredReads: [], presetPriority: { project, preset, global } } };
  const read = (id, path) => ({ id, type: 'command', command: `cat ${path}`, output: '# actual body', exitCode: 0 });
  const check = { id: 'check', type: 'command', command: 'ksf project check 甲 --json', output: JSON.stringify({ command: 'project', operation: 'check', data: { path: project, routing: { entries: [{ valid: true, object: { path: preset } }] } } }), exitCode: 0 };
  const ordered = [read('p', project), check, read('preset', preset)];
  const grade = evidence => assertCase(contract, { complete: true, changes: [], evidence }).find(c => c.id === 'preset-body-order').verdict;
  assert.equal(grade([{ id: 'd', type: 'command', command: 'ksf context capabilities --json', output: '{"data":{"complete":true}}', exitCode: 0 }, ...ordered]), 'pass');
  assert.equal(grade([read('global', global), ...ordered]), 'fail');
  assert.equal(grade([ordered[0], ordered[2], check]), 'fail');
  assert.equal(grade([ordered[0]]), 'indeterminate');
  assert.equal(grade([ordered[0], { ...check, output: JSON.stringify({ command: 'project', operation: 'check', data: { path: project, routing: { entries: [] } } }) }, ordered[2]]), 'indeterminate');
  assert.equal(assertCase(contract, { complete: false, changes: [], evidence: [read('global', global), ...ordered] }).find(c => c.id === 'preset-body-order').verdict, 'indeterminate');
});
test('ability subchecks cannot be hidden behind a passing dimension', () => {
  const evidence = [{ id: 'e', type: 'message', text: 'actual' }], judge = passJudge(evidence);
  judge.abilityChecks[0] = { check: 'preset_order', verdict: 'fail', explanation: 'wrong order', evidence: ['e'] };
  assert.equal(validateJudgment(judge, evidence), false);
  judge.dimensions.find(d => d.dimension === 'ability').verdict = 'fail';
  assert.equal(validateJudgment(judge, evidence), true);
});
test('large review outputs are byte-exact external references rather than silent truncation', t => {
  const root = temporary(t), output = '真实检索输出\n'.repeat(9000), e = { id: 't1-e1', type: 'command', command: 'rg pattern 知识', output, exitCode: 0 };
  const c = { id: 'X01', title: 'packet', turns: [{ prompt: 'query' }], expected: { criteria: ['evidence'], requiredReads: [], allowedWrites: [] } };
  const observation = { complete: true, changes: [], artifacts: [], evidence: [e] };
  const prepared = prepareReviewPacket(root, c, observation, [], []);
  assert.equal(prepared.externalized.length, 1); assert.ok(prepared.prompt.length < output.length);
  assert.equal(readFileSync(join(root, prepared.externalized[0].path), 'utf8'), output);
  assert.equal(observation.evidence[0].output, output); assert.ok(existsSync(join(root, 'review-input.json')));
});
test('normalization keeps actual messages and commands, excludes reasoning and rejects broken streams', () => {
  const invocation = { exitCode: 0, parseErrors: [], events: [
    { type: 'thread.started', thread_id: 'session' }, { type: 'item.completed', item: { type: 'reasoning', text: 'not collected' } },
    { type: 'item.completed', item: { type: 'command_execution', command: 'cat source', aggregated_output: 'body', exit_code: 0 } },
    { type: 'item.completed', item: { type: 'agent_message', text: 'done' } }, { type: 'turn.completed', usage: { input_tokens: 12 } },
  ] };
  const result = normalizeInvocation(invocation, 2);
  assert.equal(result.complete, true); assert.equal(result.evidence.length, 2); assert.equal(result.evidence[0].id, 't2-e3');
  assert.equal(normalizeInvocation({ ...invocation, parseErrors: ['bad'] }, 2).complete, false);
  assert.equal(normalizeInvocation({ ...invocation, timedOut: true }, 2).complete, false);
  assert.equal(normalizeInvocation({ ...invocation, events: [...invocation.events, { type: 'item.completed', item: { type: 'new_unknown_tool' } }] }, 2).complete, false);
});
test('hard violations cannot be averaged; lost evidence and invented citations cannot pass', () => {
  const contract = { expected: { allowedWrites: [], requiredReads: ['知识/事实.md'] } };
  const evidence = [{ id: 'e1', type: 'message', text: 'I read it' }], observation = { complete: false, changes: [], evidence };
  const judge = passJudge(evidence);
  assert.equal(verdict(assertCase(contract, observation), judge, evidence), 'indeterminate');
  assert.equal(verdict(assertCase(contract, { ...observation, changes: [{ path: '知识/new.md' }] }), judge, evidence), 'fail');
  assert.equal(validateJudgment({ ...judge, dimensions: judge.dimensions.map(d => ({ ...d, evidence: ['invented'] })) }, evidence), false);
  assert.equal(validateJudgment({ ...judge, dimensions: judge.dimensions.map(d => ({ ...d, verdict: 'not_applicable' })) }, evidence), false);
  assert.equal(apparatusSelfCheck().valid, true);
  assert.equal(verdict(assertCase(contract, observation), { ...judge, dimensions: judge.dimensions.map(d => ({ ...d, verdict: 'fail' })) }, evidence), 'indeterminate');
});
test('known repeated routing on an unfinished trace is a behavioral failure, not an infrastructure pass', () => {
  const contract = { expected: { allowedWrites: [], requiredReads: [] } };
  const observation = { complete: false, changes: [], evidence: Array.from({ length: 6 }, (_, i) => ({ id: `t1-e${i}`, type: 'command', command: 'ksf context capabilities --json', output: 'same result', exitCode: 0 })) };
  assert.equal(verdict(assertCase(contract, observation), null, observation.evidence), 'fail');
});
test('equivalent knowledge sources satisfy a group without forcing one canonical filename', () => {
  const c = { expected: { allowedWrites: [], requiredReads: [], requiredReadGroups: [['知识/索引.md', '知识/正文.md']] } };
  const evidence = [{ id: 'e1', type: 'command', command: 'cat 知识/正文.md', output: '同一方法的原文', exitCode: 0 }];
  assert.equal(assertCase(c, { complete: true, changes: [], evidence }).find(c => c.id === 'read-group:1').verdict, 'pass');
});
test('artifact collection refuses agent-created links even through a linked parent directory', t => {
  const root = temporary(t), outside = temporary(t); put(outside, 'private.md', 'must not collect'); symlinkSync(outside, join(root, 'linked'));
  assert.equal(regularFile(root, 'linked/private.md'), false);
  assert.equal(inventory(root, () => true, { recordLinks: true }).linked.type, 'symlink');
  const o = { complete: true, evidence: [], changes: [{ path: 'linked', after: { type: 'symlink' } }] };
  assert.equal(verdict(assertCase({ expected: { allowedWrites: ['linked'], requiredReads: [] } }, o), null, []), 'fail');
});
test('business diff includes modes and deletions but excludes runtime cache and nested Git mechanics', t => {
  const root = temporary(t); put(root, '知识/a.md', 'before'); put(root, '.agents/runtime-data/cache', 'one'); put(root, 'repositories/a/.git/x', 'one');
  const before = inventory(root, businessFiles); put(root, '知识/a.md', 'after'); put(root, '.agents/runtime-data/cache', 'two');
  assert.deepEqual(changes(before, inventory(root, businessFiles)).map(c => c.path), ['知识/a.md']);
  assert.equal(changes({ a: { sha256: '1', mode: 0o600 } }, { a: { sha256: '1', mode: 0o644 } }).length, 1);
  assert.equal(changes({ a: { sha256: '1' } }, {})[0].kind, 'removed');
});
test('fictional fixtures construct valid source identity, exact missing dependency and project preference', t => {
  const root = temporary(t); fictional(root, 'sources');
  assert.match(readFileSync(join(root, 'repositories/north/ksf-source.yaml'), 'utf8'), /kind: ksf-ability-source/);
  assert.match(readFileSync(join(root, '项目/晨光方案/project.md'), 'utf8'), /partner.demo.editor@1.0.0/);
  assert.match(readFileSync(join(root, '能力/搭档/partner.demo.incomplete/partner.md'), 'utf8'), /competency.demo.missing@1.0.0/);
  assert.match(readFileSync(join(root, '能力/搭档/partner.demo.incomplete/partner.md'), 'utf8'), /user_revision: 1/);
  assert.doesNotMatch(readFileSync(join(root, 'repositories/north/能力/搭档/partner.demo.joint/partner.md'), 'utf8'), /user_revision/);
  assert.match(readFileSync(join(root, 'repositories/north/能力/搭档/partner.demo.joint/partner.md'), 'utf8'), /version: 1.0.0/);
  assert.match(readFileSync(join(root, 'repositories/south/能力/搭档/partner.demo.joint/partner.md'), 'utf8'), /version: 2.0.0/);
  assert.equal(existsSync(join(root, '能力/基本功/competency.demo.missing')), false);
});
test('new evidence case genuinely overturns a previously supported and scoped premise', t => {
  const root = temporary(t), contract = suite.cases.find(c => c.id === 'C02'); fictional(root, contract.variant);
  const before = readFileSync(join(root, '项目/晨光方案/资料/照明约束.md'), 'utf8');
  assert.match(before, /当前方案运行固件2.3/); assert.match(before, /已实测.*无需另配网关/);
  const after = contract.turns[1].inject['项目/晨光方案/资料/网关确认.md'];
  assert.match(after, /当前方案已升级至固件2.4/); assert.match(after, /必须配套G7网关/); assert.match(after, /亮度调节能力仍然有效/);
});
test('A01 competing routes have distinct necessary methods and source material', t => {
  const root = temporary(t); fictional(root, 'preset-priority');
  const content = p => readFileSync(join(root, p), 'utf8');
  assert.match(content('能力/搭档/partner.demo.editor/partner.md'), /competency.demo.edit@1.0.0/);
  assert.match(content('能力/基本功/competency.demo.edit/competency.md'), /客户表达约定/);
  assert.match(content('项目/晨光方案/资料/客户表达约定.md'), /客厅灯/);
  assert.match(content('能力/协同/cooperation.demo.delivery/cooperation.md'), /partner.demo.delivery-editor@1.0.0/);
  assert.doesNotMatch(content('能力/协同/cooperation.demo.delivery/cooperation.md'), /partner.demo.editor@/);
  assert.match(content('能力/基本功/competency.demo.delivery-edit/competency.md'), /设备台账/);
  assert.match(content('项目/晨光方案/资料/设备台账.md'), /L-17/);
});
function fixture(t) {
  const root = temporary(t), home = temporary(t);
  for (const path of ['AGENTS.md', '.agents/ksf', '.agents/ksf.ps1', '.agents/core/runtime/src/cli.js']) put(root, path, 'isolated fixture');
  for (const path of ['.agents/core/abilities/partners/ksf-runtime/partner.md', '.agents/core/abilities/competencies/ability-route/competency.md']) put(root, path, 'synthetic fixed definition');
  put(root, '项目/ksf-develop/project.md', '# actual root card');
  put(root, '知识/方法论/知识萃取/course_overview.md', '# actual method');
  json(root, '.agents/user-data/eval-routing.json', { schemaVersion: 1, cases: {
    P02: { turns: [{ prompt: '请核对实际项目。' }], expected: { criteria: ['依据实际根卡'], requiredReads: ['项目/ksf-develop/project.md'] } },
    K02: { turns: [{ prompt: '请核对实际方法。' }], expected: { criteria: ['依据实际方法'], requiredReads: ['知识/方法论/知识萃取/course_overview.md'] } },
  } });
  put(root, '.agents/core/runtime/src/eval/answers.js', 'must not leak');
  put(root, '.agents/core/runtime/tests/answers.test.js', 'must not leak');
  put(home, 'auth.json', '{}');
  const host = { executable: '/fictional/codex', version: 'synthetic', model: 'existing-test-config', configHome: home, reasoningEffort: null };
  const inspect = () => host, verify = () => ({ valid: true, synthetic: true });
  return { root, home, inspect, verify };
}
test('frozen source contains working-tree bytes but excludes test answers and rebinds original physical paths', t => {
  const f = fixture(t), frozen = join(temporary(t), 'frozen'); put(f.root, '项目/ksf-develop/project.md', `working tree ${f.root}/.agents/core`);
  const manifest = freezeInstance(f.root, frozen), target = join(temporary(t), 'workspace');
  assert.equal(existsSync(join(frozen, '.agents/core/runtime/src/eval/answers.js')), false);
  assert.equal(existsSync(join(frozen, '.agents/core/runtime/tests/answers.test.js')), false);
  assert.equal(existsSync(join(frozen, '.agents/user-data/eval-routing.json')), false);
  materialize(frozen, target, suite.cases.find(c => c.id === 'P02'), manifest);
  assert.ok(readFileSync(join(target, '项目/ksf-develop/project.md'), 'utf8').includes(target));
  assert.ok(readFileSync(join(f.root, '项目/ksf-develop/project.md'), 'utf8').includes(f.root));
});
test('broken private case configuration is preserved and reported as invalid rather than missing', t => {
  const f = fixture(t), path = join(f.root, '.agents/user-data/eval-routing.json'); writeFileSync(path, '{broken');
  assert.throws(() => loadCases(f.root), { code: 'EVAL_INSTANCE_CASES_INVALID' });
  assert.equal(readFileSync(path, 'utf8'), '{broken');
});
test('CLI rejects missing profiles, unsafe run IDs and unknown/repeated options without invoking models', async () => {
  for (const args of [['run', 'routing'], ['run', 'routing', '--profile', 'bad'], ['check', 'routing', '--profile', 'core'], ['read', '../x'], ['check', 'routing', '--json', '--json']]) {
    const result = await runEvalCommand([...args, ...(args.includes('--json') ? [] : ['--json'])], '/unused');
    assert.ok(result.exitCode > 0); assert.equal(JSON.parse(result.stdout).ok, false);
  }
});
function fakeInvocation(args) {
  assert.deepEqual(readdirSync(join(args.privateRoot, 'host-homes')), [basename(args.home)], 'Only the current host home remains; old subject histories are removed before fresh recovery and review.');
  const session = args.sessionId ?? randomUUID();
  let text = 'Synthetic fixture response, not an Agent acceptance result.', tools = [];
  if (args.schema) {
    const packet = JSON.parse(args.prompt.slice(args.prompt.indexOf('{"case"')));
    const judgment = passJudge(packet.observation.evidence);
    if (packet.case.id === 'J01') judgment.dimensions.find(d => d.dimension === 'ability').verdict = 'fail';
    if (packet.case.id === 'J02') judgment.dimensions.find(d => d.dimension === 'materials').verdict = 'indeterminate';
    for (const [check, value] of Object.entries({ ...(['J04', 'J05'].includes(packet.case.id) ? { preset_order: 'fail', selection: 'pass' } : {}),
      ...(packet.case.id === 'J06' ? { preset_order: 'pass', selection: 'pass' } : {}),
      ...(['J07', 'J08'].includes(packet.case.id) ? { exception_notice: packet.case.id === 'J07' ? 'fail' : 'pass' } : {}) }))
      Object.assign(judgment.abilityChecks.find(c => c.check === check), { verdict: value, evidence: packet.observation.evidence.map(e => e.id) });
    if (judgment.abilityChecks.some(c => c.verdict === 'fail')) judgment.dimensions.find(d => d.dimension === 'ability').verdict = 'fail';
    text = JSON.stringify(judgment);
  } else {
    const priorityFixture = existsSync(join(args.workspace, '项目/晨光方案/资料/客户表达约定.md'));
    const files = Object.keys(inventory(args.workspace)).filter(p => p.endsWith('.md') && !['知识/knowledge.md', '知识/干扰/业务建议.md'].includes(p) && (!priorityFixture || p !== '能力/协同/cooperation.demo.delivery/cooperation.md'));
    tools = [{ type: 'item.completed', item: { type: 'command_execution', command: 'ksf context capabilities --json', aggregated_output: '{"data":{"complete":true}}', exit_code: 0 } },
      { type: 'item.completed', item: { type: 'command_execution', command: 'cat ' + files.join(' '),
      aggregated_output: files.map(p => readFileSync(join(args.workspace, p), 'utf8')).join('\n'), exit_code: 0 } }];
    if (existsSync(join(args.workspace, '项目/晨光方案/资料/客户表达约定.md'))) tools.splice(1, 0,
      { type: 'item.completed', item: { type: 'command_execution', command: 'cat 项目/晨光方案/project.md', aggregated_output: readFileSync(join(args.workspace, '项目/晨光方案/project.md'), 'utf8'), exit_code: 0 } },
      { type: 'item.completed', item: { type: 'command_execution', command: 'ksf project check 晨光方案 --json', aggregated_output: JSON.stringify({ command: 'project', operation: 'check', data: { path: '项目/晨光方案/project.md', routing: { entries: [{ valid: true, object: { path: '能力/搭档/partner.demo.editor/partner.md' } }] } } }), exit_code: 0 } });
  }
  const events = [{ type: 'thread.started', thread_id: session }, { type: 'turn.started' }, ...tools,
    { type: 'item.completed', item: { type: 'agent_message', text } }, { type: 'turn.completed', usage: { synthetic: true } }];
  events.forEach(args.onEvent);
  return Promise.resolve({ exitCode: 0, events, parseErrors: [], stderr: '', timedOut: false, outputLimit: false });
}
test('offline check inspects apparatus but never runs the injected model adapter', t => {
  const f = fixture(t); assert.equal(checkRouting(f.root, f).valid, true);
});
test('batch preserves six independent synthetic records, immutable evidence, exact continuation and calibration gate', async t => {
  const f = fixture(t), dependencies = { ...f, invoke: fakeInvocation };
  const report = await runRouting(f.root, 'calibration', dependencies);
  assert.equal(report.results.length, 6); assert.equal(report.calibrationReady, true); assert.equal(report.summary.verdict.pass, 6);
  assert.equal(readRun(f.root, report.runId).materialDigest, report.materialDigest);
  const next = await runRouting(f.root, 'core', dependencies);
  assert.equal(next.results.length, 40); assert.equal(next.calibrationRun, report.runId);
  const resumed = next.results.find(r => r.id === 'T04'); assert.notEqual(resumed.turns[0].sessionId, resumed.turns[1].sessionId);
  const continued = next.results.find(r => r.id === 'T01'); assert.equal(continued.turns[0].sessionId, continued.turns[1].sessionId);
  assert.equal(continued.turns[0].fresh, true); assert.equal(continued.turns[1].fresh, false);
  assert.equal(resumed.turns[1].fresh, true);
  const unique = new Set(next.results.map(r => r.turns[0].sessionId)); assert.equal(unique.size, 40);
  put(f.root, '知识/方法论/知识萃取/course_overview.md', '# changed');
  await assert.rejects(runRouting(f.root, 'core', dependencies), { code: 'EVAL_CALIBRATION_REQUIRED' });
});
test('infrastructure failure preserves evidence, stops batch, and does not become routing failure or pass', async t => {
  const f = fixture(t), report = await runRouting(f.root, 'calibration', { ...f, invoke: async () => ({ exitCode: 1, events: [], parseErrors: [], stderr: 'fixture login failed' }) });
  assert.equal(report.results.length, 1); assert.equal(report.summary.notRun, 5); assert.equal(report.results[0].runStatus, 'infrastructure_error');
  assert.equal(report.results[0].verdict, 'indeterminate'); assert.equal(report.calibrationReady, false);
});
test('guard denies real-instance reads and writes outside its actual disposable root', t => {
  if (process.platform !== 'darwin') return t.skip('macOS guard contract; other host adapters are not implemented');
  try { inspectHost(); } catch { return t.skip('Optional Codex installation is unavailable; this does not count as an isolation verification.'); }
  const source = temporary(t), privateRoot = temporary(t); put(source, 'AGENTS.md', 'private original');
  assert.equal(verifyGuard(source, privateRoot).valid, true);
});
test('credential redaction removes token-shaped values without recording auth state', () => {
  assert.equal(redact('Bearer abc.def.g sk-abcdefghijklmnopq'), 'Bearer [REDACTED] [REDACTED_KEY]');
});
test('reviewer inputs are read-only and all current and prior host homes are denied to tools', t => {
  if (process.platform !== 'darwin') return t.skip('macOS native permission contract');
  let host; try { host = inspectHost(); } catch { return t.skip('Optional Codex installation unavailable'); }
  const source = temporary(t), privateRoot = temporary(t), input = join(privateRoot, 'review-input'), home = join(privateRoot, 'host-homes/current');
  put(source, 'AGENTS.md', 'private source'); put(input, 'evidence', 'evidence-proof');
  put(privateRoot, 'host-homes/prior/auth.json', 'dummy-prior-secret'); put(home, 'auth.json', 'dummy-current-secret');
  put(home, 'config.toml', guardProfile(source, privateRoot, host, home, [input]));
  const check = (command, args) => spawnSync(host.executable, ['sandbox', '-P', 'ksf-eval', '-C', privateRoot, '--', command, ...args], {
    encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, CODEX_HOME: home, TMPDIR: privateRoot },
  });
  assert.equal(check('/bin/cat', [join(input, 'evidence')]).stdout, 'evidence-proof');
  assert.notEqual(check('/usr/bin/touch', [join(input, 'new')]).status, 0);
  for (const name of ['prior', 'current']) assert.notEqual(check('/bin/cat', [join(privateRoot, 'host-homes', name, 'auth.json')]).status, 0);
  assert.equal(check('/usr/bin/touch', [join(privateRoot, 'scratch')]).status, 0);
});
