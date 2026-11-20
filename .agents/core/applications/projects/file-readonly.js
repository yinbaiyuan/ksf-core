import {evidenceReferences} from './governance-model.js';

const pathKey = path => path?.normalize('NFC').toLowerCase();
const evidenceNotice = {
  title: '验收证据 · 只读',
  reason: '此文件已被用作验收证据，保留原记录以便核对。',
  supplement: '补充进展：通过“编辑任务”补充当前结果，或新建补充说明。',
  revise: '修订报告：保留原报告，另存修订版；在任务“维护验收”或里程碑／项目复盘中更新证据，再重新核对相关验收结论。',
};

// Explain an existing read-only decision; this never grants or removes access.
export function fileReadOnlyNotice(record, entry, file, scope) {
  if (entry?.digest) return evidenceNotice;
  if (file?.writable === true) return null;
  if (scope === 'archived' || record?.readOnly || record?.valid === false) return null;
  const path = pathKey(entry?.path);
  if (!path) return null;
  return record?.documents?.some(doc => evidenceReferences(doc.metadata).some(ref =>
    typeof ref.digest === 'string' && pathKey(ref.path) === path)) ? evidenceNotice : null;
}

export function createFileReadOnlyNotice(notice) {
  if (!notice) return null;
  const node = document.createElement('aside');
  node.className = 'pg-file-readonly-notice';
  node.setAttribute('role', 'note');
  node.setAttribute('aria-label', notice.title);
  const title = document.createElement('strong');
  title.textContent = notice.title;
  node.append(title);
  for (const text of [notice.reason, notice.supplement, notice.revise]) {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    node.append(paragraph);
  }
  return node;
}
