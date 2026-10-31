import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import { taskIds, turns, readTurn, readJSON, taskPath, config } from '../task-capture/storage.js';
import { ownedTargets } from '../task-capture/targets.js';

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const allowed = turn => turn.policy === 'capture' && !turn.capturePolicyHeld && !turn.chatPolicyHeld && !turn.explicitExcluded && turn.status !== 'excluded';
const visible = turn => (turn.messages ?? []).filter(m => ['user', 'assistant'].includes(m.role));
const at = (message, turn) => Number.isFinite(Date.parse(message.at)) ? new Date(message.at).toISOString() : turn.startedAt;
const text = message => (message.content ?? []).filter(b => ['text', 'input_text', 'output_text'].includes(b.type)).map(b => b.text ?? '').join('\n');
const omittedTypes = message => [...new Set((message.content ?? []).filter(b => !['text', 'input_text', 'output_text'].includes(b.type)).map(b => b.type))];
function summary(turn) {
  const messages = allowed(turn) ? visible(turn) : [];
  return { taskId: turn.taskId, turnId: turn.turnId, revision: turn.revision,
    digest: hash([turn.revision, turn.policy, turn.status, turn.routes, messages]),
    allowed: allowed(turn), startedAt: turn.startedAt, updatedAt: turn.updatedAt, status: turn.status,
    issues: allowed(turn) ? turn.issues : [], route: allowed(turn) ? turn.routes.at(-1)?.snapshot ?? null : null,
    targets: allowed(turn) ? ownedTargets(turn) : [],
    messages: messages.map(m => ({ id: m.id, at: at(m, turn), role: m.role, phase: m.phase, timeKnown: Number.isFinite(Date.parse(m.at)), omittedContentTypes: omittedTypes(m) })),
  };
}

/** Public, read-only evidence boundary. No raw host transcript or automatic route inference. */
export function createTaskReviewSource(root) {
  async function sources({ startAt, endAt, taskId, limit = 50, offset = 0 } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) fail('INVALID_ARGUMENTS', '分页需要 limit 1–100 和非负 offset。');
    if (taskId !== undefined && !/^[a-f0-9]{64}$/.test(taskId)) fail('INVALID_ARGUMENTS', '聊天编号无效。');
    if ((startAt !== undefined || endAt !== undefined) && (!Number.isFinite(Date.parse(startAt)) || !Number.isFinite(Date.parse(endAt)) || Date.parse(startAt) >= Date.parse(endAt))) fail('INVALID_ARGUMENTS', '需要有效的起止时间。');
    const records = [], chats = [], errors = []; let index = 0;
    for (const id of taskId ? [taskId] : taskIds(root)) {
      const taskErrors = [];
      try {
        const all = turns(root, id, { onError(error, turnId) { taskErrors.push({ taskId: id, turnId, code: error.code ?? 'TASK_REVIEW_READ_FAILED', message: '部分证据无法读取，原件已保留。' }); } });
        const summaries = all.map(summary), admitted = summaries.filter(t => t.allowed);
        if (!admitted.length) { errors.push(...taskErrors); continue; }
        let stored;
        try { stored = readJSON(root, `${taskPath(id)}/task.json`); } catch (error) { taskErrors.push({ taskId: id, code: error.code ?? 'TASK_REVIEW_READ_FAILED', message: '聊天摘要无法读取。' }); }
        const title = stored?.title ?? '未命名聊天';
        const selected = admitted.filter(t => startAt === undefined || t.messages.some(m => Date.parse(m.at) >= Date.parse(startAt) && Date.parse(m.at) < Date.parse(endAt)) || (!t.messages.length && Date.parse(t.startedAt) >= Date.parse(startAt) && Date.parse(t.startedAt) < Date.parse(endAt)));
        if (selected.length || taskId) {
          chats.push({ taskId: id, title, fingerprint: hash(summaries.map(t => [t.turnId, t.digest])), turns: summaries.map(({ messages, route, ...t }) => ({ ...t, messageCount: messages.length })),
            latestMessageAt: admitted.flatMap(t => t.messages.map(m => m.at)).sort().at(-1) ?? null,
            latestTurnId: admitted.at(-1)?.turnId ?? null, errors: taskErrors });
          for (const turn of selected) records.push({ ...turn, title });
        }
        errors.push(...taskErrors);
      } catch (error) { errors.push({ taskId: id, code: error.code ?? 'TASK_REVIEW_READ_FAILED', message: '聊天证据无法读取，原件已保留。' }); }
      if (++index % 8 === 0) await setImmediate();
    }
    records.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.taskId.localeCompare(b.taskId) || a.turnId.localeCompare(b.turnId));
    const page = records.slice(offset, offset + limit), ids = new Set(page.map(t => t.taskId));
    let capture; try { const value = config(root); capture = { enabled: value?.enabled ?? false, activatedAt: value?.activatedAt ?? null }; } catch (error) { capture = { enabled: false, activatedAt: null }; errors.push({ code: error.code, message: '采集配置不可读。' }); }
    return { records: page, chats: chats.filter(t => ids.has(t.taskId) || (taskId && t.taskId === taskId)), total: records.length, nextOffset: offset + limit < records.length ? offset + limit : null, errors, capture };
  }
  function read({ taskId, turnId, revision, offset = 0, limit = 32 } = {}) {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail('INVALID_ARGUMENTS', '证据分页无效。');
    const turn = readTurn(root, taskId, turnId);
    if (!turn || !allowed(turn)) fail('TASK_REVIEW_UNAVAILABLE', '证据不存在或当前采集策略不允许读取。');
    if (revision !== undefined && turn.revision !== revision) fail('TASK_REVIEW_CONFLICT', '原轮次已变化，请重新取得证据版本。');
    const value = summary(turn), all = visible(turn), messages = []; let size = 0;
    for (const message of all.slice(offset, offset + limit)) {
      const body = text(message), available = 180000 - size;
      if (available <= 0) break;
      const selected = body.slice(0, available); size += selected.length;
      messages.push({ id: message.id, role: message.role, phase: message.phase, at: at(message, turn), text: selected,
        timeKnown: Number.isFinite(Date.parse(message.at)), truncated: selected.length !== body.length, omittedContentTypes: omittedTypes(message) });
      if (selected.length !== body.length) break;
    }
    const nextOffset = offset + messages.length < all.length ? offset + messages.length : null;
    return { ...value, messages, total: all.length, nextOffset };
  }
  return { sources, read };
}
