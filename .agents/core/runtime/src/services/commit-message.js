import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MetadataError, decodeUtf8 } from '../metadata/errors.js';

export const commitTypes = ['feat', 'fix', 'refactor', 'docs', 'test', 'perf', 'build', 'ci', 'chore', 'revert'];
export const commitTemplatePath = '.agents/core/docs/templates/commit-message.txt';
const requiredSections = ['原因', '变更', '验证'];
const placeholder = /<(?:type|scope|中文动作摘要|标题|原因|变更|验证|说明[^<>\n]*|实际[^<>\n]*)>|\{\{(?:type|scope|title|summary|reason|changes|validation|原因|变更|验证)\}\}|^\s*(?:[-*]\s*)?(?:TODO|TBD|待填写|待补充)\s*$/imu;

// Shared by commit messages and PR descriptions; a title alone has no footer.
export function checkCommitTitle(title) {
  const errors = [], warnings = [];
  const error = (code, message) => errors.push({ code, message });
  if (typeof title !== 'string') {
    error('COMMIT_TITLE_INVALID', 'Expected a conventional title.');
    return { valid: false, errors, warnings, semanticReviewRequired: true };
  }
  const titleLength = [...title].length;
  const match = /^([a-z]+)\(([a-z][a-z0-9-]*)\)(!)?: (\S(?:.*\S)?)$/u.exec(title);
  if (!match || !commitTypes.includes(match[1])) error('COMMIT_TITLE_INVALID', 'Use type(scope)[!]: action summary with a supported lowercase type and scope.');
  if (titleLength > 72) error('COMMIT_TITLE_TOO_LONG', 'The title must not exceed 72 Unicode code points.');
  else if (titleLength > 50) warnings.push({ code: 'COMMIT_TITLE_LENGTH', message: 'Prefer a title of at most 50 Unicode code points.' });
  if (/[。.!！?？;；]$/u.test(title)) error('COMMIT_TITLE_PUNCTUATION', 'Do not end the title with sentence punctuation.');
  if (match && /^(?:更新(?:代码|文件|文档)?|优化(?:逻辑|代码|功能)?|修复(?:问题|错误|bug)?|完善(?:功能|代码)?|update(?: code| files)?|fix(?: bugs?)?)$/iu.test(match[4])) {
    error('COMMIT_SUMMARY_VAGUE', 'Describe the specific change and its result.');
  }
  if (/[\u0000-\u001f\u007f]/u.test(title)) error('COMMIT_TITLE_CONTROL', 'The title must be a single line without control characters.');
  return { valid: errors.length === 0, title, titleLength, type: match?.[1] ?? null, scope: match?.[2] ?? null,
    breaking: !!match?.[3], errors, warnings, semanticReviewRequired: true };
}

// This checks the message contract, never the truth of a reason or a test claim.
export function checkCommitMessage(input) {
  if (typeof input !== 'string') return { valid: false, errors: [{ code: 'COMMIT_MESSAGE_REQUIRED', message: 'Expected a complete commit message.' }], warnings: [], semanticReviewRequired: true };
  const message = input.replaceAll('\r\n', '\n'), lines = message.split('\n'), title = lines[0];
  const checkedTitle = checkCommitTitle(title), errors = [...checkedTitle.errors], warnings = checkedTitle.warnings;
  const error = (code, message) => errors.push({ code, message });
  if (message.length > 60200 || message.slice(title.length + 2).trimEnd().length > 60000) error('COMMIT_MESSAGE_TOO_LARGE', 'The commit body must not exceed 60000 UTF-16 code units.');
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(message)) error('COMMIT_MESSAGE_CONTROL', 'Control characters are not allowed.');
  if (placeholder.test(message)) error('COMMIT_MESSAGE_PLACEHOLDER', 'Replace template placeholders before using the message.');
  if (lines[1] !== '') error('COMMIT_BODY_SEPARATOR', 'Separate the title and body with one blank line.');
  const headings = lines.flatMap((line, index) => {
    const section = /^(原因|变更|验证)：$/u.exec(line);
    return section ? [{ name: section[1], index }] : [];
  });
  if (headings.map(h => h.name).join(',') !== requiredSections.join(',')) {
    error('COMMIT_BODY_SECTIONS', 'Include 原因：, 变更： and 验证： exactly once, in that order.');
  } else {
    if (headings[0].index !== 2) error('COMMIT_BODY_PREAMBLE', 'Start the body with 原因： immediately after the blank separator.');
    for (let i = 0; i < headings.length; i++) {
      const start = headings[i].index + 1, limit = headings[i + 1]?.index ?? lines.length;
      const content = lines.slice(start, limit);
      const optional = content.findIndex(line => /^(?:兼容性|剩余问题)：$|^(?:BREAKING CHANGE|[A-Za-z][A-Za-z-]*): /u.test(line));
      const text = (optional < 0 ? content : content.slice(0, optional)).join('\n').trim();
      if (!/[\p{L}\p{N}]/u.test(text)) error('COMMIT_BODY_EMPTY', `${headings[i].name} must contain a concrete explanation.`);
      if (headings[i].name === '验证' && /^(?:[-*]\s*)?未执行[。.]?$/u.test(text)) error('COMMIT_VALIDATION_REASON', 'Explain why verification was not performed.');
    }
  }
  const breaking = checkedTitle.breaking, footer = /^BREAKING CHANGE: (\S.*)$/mu.exec(message);
  if (breaking !== !!footer) error('COMMIT_BREAKING_CHANGE', 'Breaking changes require both ! in the title and a nonempty BREAKING CHANGE: footer.');
  if (/^BREAKING CHANGE:/mu.test(message) && !footer) error('COMMIT_BREAKING_CHANGE', 'Describe the incompatible behavior and migration in BREAKING CHANGE:.');
  if (footer) {
    const indices = lines.flatMap((line, index) => line.startsWith('BREAKING CHANGE:') ? [index] : []);
    if (indices.length !== 1 || indices[0] <= (headings.at(-1)?.index ?? Infinity) + 1 || lines[indices[0] - 1] !== '') {
      error('COMMIT_BREAKING_POSITION', 'Place a single BREAKING CHANGE: footer after the body, separated by a blank line.');
    }
  }
  return { valid: errors.length === 0, title, titleLength: checkedTitle.titleLength, type: checkedTitle.type, scope: checkedTitle.scope,
    breaking, errors, warnings, semanticReviewRequired: true };
}

export function readCommitText(root, from) {
  const path = resolve(root, from);
  try {
    const info = lstatSync(path);
    if (!info.isFile() || info.size > 256 * 1024) throw new MetadataError('COMMIT_FILE_INVALID', 'Expected a regular UTF-8 text file of at most 256 KiB.');
    return decodeUtf8(readFileSync(path), from);
  } catch (error) {
    if (error instanceof MetadataError) throw error;
    throw new MetadataError('COMMIT_FILE_UNREADABLE', 'Cannot read the commit message input file.');
  }
}

export function contributionCommitMessage(title, body) {
  const message = `${typeof title === 'string' ? title : ''}\n\n${typeof body === 'string' ? body : ''}`.replaceAll('\r\n', '\n').trimEnd() + '\n';
  const checked = checkCommitMessage(message);
  if (!checked.valid) {
    const failure = new Error('Supply a reviewed commit title and body that follow the commit message rules.');
    failure.code = 'COMMIT_MESSAGE_INVALID'; failure.data = checked;
    throw failure;
  }
  return message;
}
