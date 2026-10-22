import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MetadataError, decodeUtf8 } from '../metadata/errors.js';
import { checkCommitTitle } from './commit-message.js';

export const prTemplatePath = '.agents/core/docs/templates/pr-description.md';
export const prRequiredSections = ['背景与目的', '主要变更', '验证结果', '影响与兼容'];
const optionalSections = ['迁移与回滚', '审阅重点', '关联信息', '剩余工作'];
const placeholder = /<(?:原有问题[^<>\n]*|具体行为[^<>\n]*|实际命令[^<>\n]*|未验证[^<>\n]*|受影响[^<>\n]*|说明[^<>\n]*|标题|中文动作摘要)>|\{\{(?:title|background|changes|validation|impact|migration|背景|变更|验证|影响)\}\}|^\s*(?:[-*]\s*)?(?:TODO|TBD|待填写|待补充)\s*$/imu;
export const normalizePRText = text => text.replaceAll('\r\n', '\n').trimEnd() + '\n';

// Strip comments and fenced examples before inspecting Markdown headings/content.
// This is a narrow document contract, not a general Markdown renderer.
function visibleLines(text) {
  const lines = text.replace(/<!--[\s\S]*?(?:-->|$)/gu, '').split('\n');
  let fence = null;
  return lines.map(line => {
    if (fence) {
      if (new RegExp(`^ {0,3}${fence.char}{${fence.length},}\\s*$`).test(line)) fence = null;
      return '';
    }
    const start = /^ {0,3}(`{3,}|~{3,})/u.exec(line);
    if (start) { fence = { char: start[1][0], length: start[1].length }; return ''; }
    return line;
  });
}

export function checkPRDescription(title, input) {
  const checkedTitle = checkCommitTitle(title);
  const errors = checkedTitle.errors.map(e => ({ ...e, code: e.code.replace(/^COMMIT_/u, 'PR_') }));
  const error = (code, message) => errors.push({ code, message });
  const result = { ...checkedTitle, errors, warnings: checkedTitle.warnings.map(e => ({ ...e, code: e.code.replace(/^COMMIT_/u, 'PR_') })), semanticReviewRequired: true };
  if (typeof input !== 'string') {
    error('PR_BODY_REQUIRED', 'Supply a separate PR description.');
    return { ...result, valid: false };
  }
  const body = input.replaceAll('\r\n', '\n');
  if (body.length > 60000) error('PR_BODY_TOO_LARGE', 'The PR body must not exceed 60000 UTF-16 code units, including generated provenance.');
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(body)) error('PR_BODY_CONTROL', 'Control characters are not allowed.');
  if (placeholder.test(body) || placeholder.test(typeof title === 'string' ? title : '')) error('PR_BODY_PLACEHOLDER', 'Replace template placeholders before using the description.');
  const lines = visibleLines(body), headings = lines.flatMap((line, index) => {
    const match = /^ {0,3}##[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/u.exec(line);
    return match ? [{ name: match[1], index }] : [];
  });
  const required = headings.filter(h => prRequiredSections.includes(h.name));
  if (required.map(h => h.name).join(',') !== prRequiredSections.join(',') ||
      headings.slice(0, 4).map(h => h.name).join(',') !== prRequiredSections.join(',')) {
    error('PR_BODY_SECTIONS', 'Start with 背景与目的, 主要变更, 验证结果 and 影响与兼容 exactly once, in that order, as level-2 headings.');
  }
  if (!headings.length || lines.slice(0, headings[0].index).some(line => line.trim())) error('PR_BODY_PREAMBLE', 'Start the description with ## 背景与目的.');
  const seen = new Set();
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    if (![...prRequiredSections, ...optionalSections].includes(heading.name) || seen.has(heading.name)) error('PR_BODY_HEADING', 'Use each supported section at most once; put optional sections after the four required sections.');
    seen.add(heading.name);
    const content = lines.slice(heading.index + 1, headings[i + 1]?.index ?? lines.length)
      .filter(line => !/^ {0,3}#{1,6}(?:\s|$)/u.test(line)).join('\n').trim();
    if (!/[\p{L}\p{N}]/u.test(content)) error('PR_BODY_EMPTY', `${heading.name} must contain a concrete explanation.`);
    if (heading.name === '验证结果' && /^(?:[-*]\s*)?未执行[。.]?$/u.test(content)) error('PR_VALIDATION_REASON', 'Explain why verification was not performed.');
  }
  if (checkedTitle.breaking && !seen.has('迁移与回滚')) error('PR_BREAKING_MIGRATION', 'Breaking changes require a nonempty 迁移与回滚 section describing old use, replacement and migration.');
  return { ...result, valid: errors.length === 0, sections: headings.map(h => h.name) };
}

export function readPRText(root, from) {
  try {
    const path = resolve(root, from), info = lstatSync(path);
    if (!info.isFile() || info.size > 256 * 1024) throw new MetadataError('PR_FILE_INVALID', 'Expected a regular UTF-8 text file of at most 256 KiB.');
    return decodeUtf8(readFileSync(path), from);
  } catch (error) {
    if (error instanceof MetadataError) throw error;
    throw new MetadataError('PR_FILE_UNREADABLE', 'Cannot read the PR description input file.');
  }
}

export function contributionPRBody(description, version, revision) {
  return normalizePRText(description) + `\n---\n\n贡献来源：ksf-core ${version}（${revision}）。\n仅包含已审阅的系统文件差异。\n`;
}

export function requirePRDescription(title, body) {
  const checked = checkPRDescription(title, body);
  if (!checked.valid) {
    const failure = new Error('Supply a reviewed PR description that follows the PR description rules.');
    failure.code = 'PR_DESCRIPTION_INVALID'; failure.data = checked; throw failure;
  }
  return normalizePRText(body);
}
