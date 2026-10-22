import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPRDescription, contributionPRBody, requirePRDescription } from '../src/services/pr-description.js';
import { runPRDescriptionCommand } from '../src/commands/pr-description.js';
import { parseDistributionArgs, runDistributionCommand } from '../src/commands/distribution.js';
import { prepareContribution } from '../src/distribution/contribute.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const title = 'fix(project): 拒绝覆盖并发更新的项目根卡';
const body = '## 背景与目的\n根卡可能被另一写入者修改，需保留较新内容。\n\n## 主要变更\n- 发布前核对文件快照。\n\n## 验证结果\n- 未执行：仅用于格式演示，不代表本次已运行测试。\n\n## 影响与兼容\n命令和数据格式保留，发生并发时返回冲突。\n';
const commitBody = '原因：\n需核对并发内容。\n\n变更：\n- 保留较新数据。\n\n验证：\n- 未执行：只用于测试输入。\n';

test('four sections, Chinese text and CRLF pass without claiming semantic verification', () => {
  for (const input of [body, body.replaceAll('\n', '\r\n')]) {
    const result = checkPRDescription(title, input);
    assert.equal(result.valid, true, JSON.stringify(result.errors)); assert.equal(result.semanticReviewRequired, true);
  }
  assert.equal(requirePRDescription(title, body.replaceAll('\n', '\r\n')), body);
  const full = contributionPRBody(body, '0.1.0', 'a'.repeat(40));
  assert.equal(checkPRDescription(title, full).valid, true);
});

for (const [name, input, code] of [
  ['missing section', body.replace('## 验证结果', '## 其他'), 'PR_BODY_SECTIONS'],
  ['reordered sections', body.replace('## 背景与目的', '## 主要变更').replace('## 主要变更\n-', '## 背景与目的\n-'), 'PR_BODY_SECTIONS'],
  ['duplicate section', body + '\n## 背景与目的\n其他目的。', 'PR_BODY_SECTIONS'],
  ['empty section', body.replace('根卡可能被另一写入者修改，需保留较新内容。', '-'), 'PR_BODY_EMPTY'],
  ['comment-only section', body.replace('根卡可能被另一写入者修改，需保留较新内容。', '<!-- 待填写 -->'), 'PR_BODY_EMPTY'],
  ['unexplained verification', body.replace('- 未执行：仅用于格式演示，不代表本次已运行测试。', '- 未执行'), 'PR_VALIDATION_REASON'],
  ['placeholder', body.replace('根卡可能被另一写入者修改，需保留较新内容。', '<原有问题、触发情境和目标行为>'), 'PR_BODY_PLACEHOLDER'],
  ['control', body + '\0', 'PR_BODY_CONTROL'],
  ['preamble', '贡献记录\n\n' + body, 'PR_BODY_PREAMBLE'],
  ['unsupported heading', body + '\n## 任意章节\n内容。', 'PR_BODY_HEADING'],
  ['too large', body + '字'.repeat(60000), 'PR_BODY_TOO_LARGE'],
  ['fenced template', '```markdown\n' + body + '```', 'PR_BODY_SECTIONS'],
]) test(`PR description rejects ${name}`, () => {
  const checked = checkPRDescription(title, input);
  assert.equal(checked.valid, false); assert.ok(checked.errors.some(e => e.code === code), JSON.stringify(checked.errors));
});

test('fenced headings and comments cannot fill required sections or break valid examples', () => {
  assert.equal(checkPRDescription(title, body.replace('## 验证结果', '```\n## 验证结果\n```')).valid, false);
  assert.equal(checkPRDescription(title, body.replace('## 验证结果', '<!-- ## 验证结果 -->')).valid, false);
  assert.equal(checkPRDescription(title, body.replace('- 发布前核对文件快照。', '- 发布前核对文件快照，保留 <id> 和 {{name}} 字面语法。\n```md\n## 示例章节\n```')).valid, true);
});

test('title shares D01 limits and breaking changes require a substantive migration section', () => {
  assert.equal(checkPRDescription('fix(project): 更新代码', body).valid, false);
  assert.equal(checkPRDescription('feat(core): ' + '😀'.repeat(60), body).valid, true);
  assert.equal(checkPRDescription('feat(core): ' + '😀'.repeat(61), body).valid, false);
  const breakingTitle = title.replace('(project)', '(project)!');
  assert.ok(checkPRDescription(breakingTitle, body).errors.some(e => e.code === 'PR_BREAKING_MIGRATION'));
  assert.equal(checkPRDescription(breakingTitle, body + '\n## 迁移与回滚\n<!-- 迁移 -->\n').valid, false);
  assert.equal(checkPRDescription(breakingTitle, body + '\n## 迁移与回滚\n旧调用需显式提供 PR 正文，改用 --pr-body-file；旧记录保留只读核对，回退前检查未发布计划。\n').valid, true);
});

test('CLI input is body-only and validates UTF-8, file types, help and argument exclusivity', t => {
  const dir = mkdtempSync(join(tmpdir(), 'ksf-pr-text-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, '说明.md'); writeFileSync(path, body);
  const call = args => runPRDescriptionCommand(args, root);
  assert.equal(JSON.parse(call(['check', '--title', title, '--from', path, '--json']).stdout).data.valid, true);
  for (const args of [['check'], ['check', '--from', path], ['template', '--title', title], ['check', '--title', title, '--from', path, '--from', path], ['check', '--help', '--json'], ['unknown']]) assert.equal(call(args).exitCode, 2);
  for (const args of [[], ['--help'], ['template', '-h'], ['check', '--help']]) assert.equal(call(args).exitCode, 0);
  writeFileSync(path, Buffer.from([0xff]));
  assert.equal(JSON.parse(call(['check', '--title', title, '--from', path, '--json']).stdout).errors[0].code, 'ENCODING_INVALID');
  symlinkSync(path, join(dir, 'link'));
  for (const from of [dir, join(dir, 'link'), join(dir, 'missing')]) assert.equal(call(['check', '--title', title, '--from', from]).exitCode, 1);
  writeFileSync(path, 'x'.repeat(256 * 1024 + 1)); assert.equal(call(['check', '--title', title, '--from', path]).exitCode, 1);
  const template = JSON.parse(call(['template', '--json']).stdout).data;
  assert.equal(template.template, readFileSync(join(root, template.path), 'utf8'));
  assert.equal(checkPRDescription(title, template.template).valid, false);
});

test('prepare requires separate PR input and rejects invalid descriptions before Git or networking', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ksf-pr-prepare-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const base = ['prepare', '--all', '--title', title, '--body', commitBody];
  for (const args of [base, [...base, '--pr-body', body, '--pr-body-file', 'pr.md'], [...base, '--pr-body', body, '--pr-body', body]]) assert.throws(() => parseDistributionArgs('contribute', args), { exitCode: 2 });
  writeFileSync(join(dir, 'pr.md'), '说明不足');
  const response = await runDistributionCommand('contribute', [...base, '--pr-body-file', 'pr.md', '--json'], dir);
  assert.equal(response.exitCode, 1); assert.equal(JSON.parse(response.stdout).errors[0].code, 'PR_DESCRIPTION_INVALID');
  const api = { request() { assert.fail('No network request expected.'); } };
  for (const prBody of [undefined, '', '说明不足']) await assert.rejects(prepareContribution({ root: dir, all: true, title, body: commitBody, prBody, api }), { code: 'PR_DESCRIPTION_INVALID' });
  assert.equal(existsSync(join(dir, '.agents/runtime-data/contributions')), false);
});
