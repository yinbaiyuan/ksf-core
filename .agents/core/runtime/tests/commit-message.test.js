import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCommitMessage, contributionCommitMessage } from '../src/services/commit-message.js';
import { runCommitMessageCommand } from '../src/commands/commit-message.js';
import { parseDistributionArgs, runDistributionCommand } from '../src/commands/distribution.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const title = 'fix(project): 拒绝覆盖并发更新的项目根卡';
const body = '原因：\n读取后的根卡可能被另一写入者修改。\n\n变更：\n- 写入前核对根卡基线。\n\n验证：\n- 未执行：这里仅演示消息格式，不声明实现或测试结果。';
const message = `${title}\n\n${body}\n`;

test('Chinese message and CRLF are accepted; format success still requires semantic review', () => {
  for (const input of [message, message.replaceAll('\n', '\r\n')]) {
    const result = checkCommitMessage(input);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(result.semanticReviewRequired, true);
    assert.equal(result.type, 'fix'); assert.equal(result.scope, 'project');
  }
  assert.equal(contributionCommitMessage(title, body), message);
});

test('title length is counted by Unicode code points, not bytes or UTF-16 units', () => {
  const prefix = 'feat(core): ';
  assert.equal(checkCommitMessage(`${prefix}${'字'.repeat(72 - prefix.length)}\n\n${body}`).valid, true);
  assert.ok(checkCommitMessage(`${prefix}${'字'.repeat(73 - prefix.length)}\n\n${body}`).errors.some(e => e.code === 'COMMIT_TITLE_TOO_LONG'));
  assert.equal(checkCommitMessage(`${prefix}${'😀'.repeat(72 - prefix.length)}\n\n${body}`).titleLength, 72);
});

test('literal template syntax is not confused with known unfilled message fields', () => {
  const literal = message.replace('写入前核对根卡基线。', '写入前核对根卡基线，保留 {{name}} 与 <id> 字面语法。');
  assert.equal(checkCommitMessage(literal).valid, true);
  assert.equal(checkCommitMessage(message.replace('读取后的根卡可能被另一写入者修改。', '{{reason}}')).valid, false);
});

for (const [name, input, code] of [
  ['unsupported type', message.replace('fix(project)', 'wrong(project)'), 'COMMIT_TITLE_INVALID'],
  ['missing scope', message.replace('fix(project)', 'fix'), 'COMMIT_TITLE_INVALID'],
  ['vague summary', `fix(project): 更新代码\n\n${body}`, 'COMMIT_SUMMARY_VAGUE'],
  ['punctuation', `${title}。\n\n${body}`, 'COMMIT_TITLE_PUNCTUATION'],
  ['separator', `${title}\n${body}`, 'COMMIT_BODY_SEPARATOR'],
  ['extra separator', `${title}\n\n\n${body}`, 'COMMIT_BODY_PREAMBLE'],
  ['missing section', message.replace('验证：', '其他：'), 'COMMIT_BODY_SECTIONS'],
  ['duplicate section', message + '\n原因：\n另一个原因', 'COMMIT_BODY_SECTIONS'],
  ['empty section', message.replace('读取后的根卡可能被另一写入者修改。', '-'), 'COMMIT_BODY_EMPTY'],
  ['unexplained verification', message.replace('- 未执行：这里仅演示消息格式，不声明实现或测试结果。', '- 未执行'), 'COMMIT_VALIDATION_REASON'],
  ['placeholder', message.replace('读取后的根卡可能被另一写入者修改。', '<说明修改原因>'), 'COMMIT_MESSAGE_PLACEHOLDER'],
  ['control character', message + '\0', 'COMMIT_MESSAGE_CONTROL'],
  ['breaking marker without footer', message.replace('fix(project)', 'fix(project)!'), 'COMMIT_BREAKING_CHANGE'],
  ['breaking footer without marker', message + '\nBREAKING CHANGE: 旧命令已移除，请使用新命令。', 'COMMIT_BREAKING_CHANGE'],
]) test(`commit validation rejects ${name}`, () => {
  const result = checkCommitMessage(input);
  assert.equal(result.valid, false); assert.ok(result.errors.some(e => e.code === code), JSON.stringify(result.errors));
});

test('breaking changes require a separate footer after the completed body', () => {
  const breaking = message.replace('fix(project)', 'fix(project)!');
  assert.equal(checkCommitMessage(breaking + '\nBREAKING CHANGE: 移除旧命令，改用 project write。\n').valid, true);
  assert.equal(checkCommitMessage(breaking.replace('原因：\n', '原因：\nBREAKING CHANGE: 错误的位置\n')).valid, false);
});

test('CLI reads files without Git writes, rejects bad arguments, UTF-8 and file types', t => {
  const dir = mkdtempSync(join(tmpdir(), 'ksf-message-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, '提交.txt'); writeFileSync(path, message);
  const checked = runCommitMessageCommand(['check', '--from', path, '--json'], root);
  assert.equal(checked.exitCode, 0); assert.equal(JSON.parse(checked.stdout).data.valid, true);
  for (const args of [['check'], ['template', '--from', path], ['check', '--from', path, '--from', path], ['check', '--help', '--json'], ['unknown']]) {
    assert.equal(runCommitMessageCommand(args, root).exitCode, 2);
  }
  writeFileSync(path, Buffer.from([0xff]));
  assert.equal(JSON.parse(runCommitMessageCommand(['check', '--from', path, '--json'], root).stdout).errors[0].code, 'ENCODING_INVALID');
  symlinkSync(path, join(dir, 'link'));
  assert.equal(runCommitMessageCommand(['check', '--from', join(dir, 'link')], root).exitCode, 1);
  assert.equal(runCommitMessageCommand(['check', '--from', dir], root).exitCode, 1);
  const template = JSON.parse(runCommitMessageCommand(['template', '--json'], root).stdout).data;
  assert.equal(template.template, readFileSync(join(root, template.path), 'utf8'));
  assert.equal(checkCommitMessage(template.template).valid, false);
});

test('contribution requires one explicit public body source and validates it before accessing Git', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ksf-message-body-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const args of [['prepare', '--all'], ['prepare', '--all', '--title', title],
    ['prepare', '--all', '--title', title, '--body', body, '--body-file', 'body.txt']]) {
    assert.throws(() => parseDistributionArgs('contribute', args), { exitCode: 2 });
  }
  writeFileSync(join(dir, 'body.txt'), '说明不足');
  const response = await runDistributionCommand('contribute', ['prepare', '--all', '--title', title, '--body-file', 'body.txt', '--pr-body', '说明不足', '--json'], dir);
  assert.equal(response.exitCode, 1);
  assert.equal(JSON.parse(response.stdout).errors[0].code, 'COMMIT_MESSAGE_INVALID');
});
