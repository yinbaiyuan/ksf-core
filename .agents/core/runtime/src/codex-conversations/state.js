import { createHash } from 'node:crypto';
import { requestRef, failure } from './protocol.js';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(canonical(value))).digest('hex');
const status = value => typeof value === 'string' ? value : value?.type;
const running = value => ['running', 'in_progress', 'inProgress', 'active'].includes(status(value));
export function turnsOf(state) {
  const history = state.turnHistory, inner = history?.history, entities = inner?.entitiesByKey ?? {};
  let turns;
  if (history?.kind === 'canonical' || inner?.islands !== undefined) {
    // Desktop's compact turns cache can be empty or stale. Only the canonical
    // islands index defines chronology; unindexed dictionary entries are ignored.
    if (!Array.isArray(inner?.islands)) throw failure('CODEX_HISTORY_INCOMPLETE', 'Desktop 的原生历史索引尚未完整，请稍后重试。');
    turns = [];
    for (const island of inner.islands) {
      if (!Array.isArray(island.entries)) throw failure('CODEX_HISTORY_INCOMPLETE', 'Desktop 的原生历史尚未完整。');
      for (const entry of island.entries) {
        const turn = typeof entry.value === 'string' ? entities[entry.value] : null;
        if (!turn || !Array.isArray(turn.items)) throw failure('CODEX_HISTORY_INCOMPLETE', 'Desktop 的原生历史条目尚未完整。');
        turns.push(turn);
      }
    }
  } else if (state.turns?.length) turns = state.turns;
  else turns = Object.values(entities).filter(t => Number(t.turnStartedAtMs ?? t.startedAtMs) > 0).sort((a, b) => Number(a.turnStartedAtMs ?? a.startedAtMs) - Number(b.turnStartedAtMs ?? b.startedAtMs));
  const seen = new Set();
  return turns.flatMap(t => { const id = t.id ?? t.turnId; if (!id || seen.has(id)) return []; seen.add(id); return [{ ...t, id }]; });
}
export function activeTurn(state) {
  const turns = turnsOf(state), current = turns.at(-1);
  if (current && running(current.status)) return current.id;
  if (running(state.threadRuntimeStatus)) throw failure('CODEX_HISTORY_INCOMPLETE', 'Desktop 正在运行，但尚未提供可靠的当前轮次。');
  return null;
}
export function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { for (const child of value) walk(child, visit); return; }
  visit(value); for (const child of Object.values(value)) walk(child, visit);
}
const asyncQuestionId=(item,index)=>!item.questions?.length?item.id:JSON.stringify(['request_user_input_async',item.id,index]);
function replyQuestionIds(item){
  const text=textOf(item.type==='steeringUserMessage'?{content:item.input}:item).trim();
  if(!text.startsWith('<send_user_message_question_reply>')||!text.endsWith('</send_user_message_question_reply>'))return [];
  try{const answers=JSON.parse(text.slice(34,-35).trim());return Array.isArray(answers)?answers.flatMap(answer=>typeof answer?.questionItemId==='string'?[answer.questionItemId]:[]):[];}catch{return [];}
}
function answeredQuestionIds(state){
  const ids=new Set();for(const turn of turnsOf(state))for(const item of turn.items??[])if(item.type==='userMessage'||item.type==='steeringUserMessage'&&item.status==='accepted')for(const id of replyQuestionIds(item))ids.add(id);return ids;
}
function privateQuestionIds(state){
  const ids=new Set();for(const turn of turnsOf(state))for(const item of turn.items??[])if(item.type==='agentMessage'&&item.delivery==='async'&&item.id)for(const [index,question]of(item.questions??[]).entries())if(question.isSecret)ids.add(asyncQuestionId(item,index));return ids;
}
function nativeRequests(state){
  if(state.requests===undefined)return [];
  if(!Array.isArray(state.requests))throw failure('CODEX_REQUESTS_INVALID','原生请求格式未知，请在Desktop处理。');
  return state.requests.filter(item=>item&&typeof item==='object');
}
export function questionsOf(state) {
  const results = [];
  // Requests belong to this native envelope. Tool results are data, even if
  // their nested objects look exactly like requestUserInput/approval messages.
  for(const item of nativeRequests(state)) {
    if (item.method !== 'item/tool/requestUserInput' || item.id === undefined || !Array.isArray(item.params?.questions)) continue;
    const questions = item.params.questions;
    // Secret questions and approvals stay in Desktop. Never transport their values.
    if (!questions.length || questions.some(q => q.isSecret)) continue;
    results.push({ request: requestRef(item.id), turnId: item.params.turnId, questions: questions.map(q => ({ id: q.id, header: q.header, question: q.question, isOther: q.isOther, options: q.options?.map(o => ({ label: o.label, description: o.description })) })) });
  }
  const answered = answeredQuestionIds(state);
  for (const turn of turnsOf(state)) for (const item of turn.items ?? []) {
    if (item.type !== 'agentMessage' || item.delivery !== 'async' || !item.id) continue;
    const legacy = !item.questions?.length;
    for (const [index, q] of (legacy ? [{ title: item.text }] : item.questions).entries()) {
      if (q.isSecret || !q.title?.trim()) continue;
      const asyncId = asyncQuestionId(item,index);
      if (answered.has(asyncId)) continue;
      const key = 'async_' + digest(turn.id + '\x00' + asyncId).slice(0, 32);
      results.push({ request: requestRef(key), turnId: turn.id, asyncId, questions: [{ id: key, question: q.title, options: (q.options ?? []).filter(x => typeof x === 'string').map(label => ({ label, description: '' })) }] });
    }
  }
  return results;
}
export function planOf(state) {
  const pending = state.pendingPlanImplementation;
  if (pending?.planContent) return { turnId: pending.turnId, text: pending.planContent, revision: digest([pending.turnId, pending.planContent]) };
  for (const r of state.requests ?? []) if (r.method === 'item/plan/requestImplementation' && r.params?.planContent) return { turnId: r.params.turnId, text: r.params.planContent, revision: digest([r.params.turnId, r.params.planContent]) };
  for (const turn of turnsOf(state).slice().reverse()) for (const item of (turn.items ?? []).slice().reverse()) if (item.type === 'planImplementation' && !item.isCompleted && item.planContent) return { turnId: turn.id, text: item.planContent, revision: digest([turn.id, item.planContent]) };
  return null;
}
export function textOf(item) {
  if (typeof item.text === 'string') return item.text;
  return (item.content ?? []).filter(c => ['text', 'input_text', 'output_text'].includes(c.type)).map(c => c.text ?? '').join('');
}
export function messagesOf(state) {
  const result = [],privateIds=privateQuestionIds(state);
  for (const turn of turnsOf(state)) for (const item of turn.items ?? []) {
    if (!['userMessage', 'agentMessage', 'steeringUserMessage'].includes(item.type)) continue;
    if(item.type==='agentMessage'&&item.delivery==='async'&&item.questions?.some(q=>q.isSecret)||item.type!=='agentMessage'&&replyQuestionIds(item).some(id=>privateIds.has(id)))continue;
    const text = textOf(item.type === 'steeringUserMessage' ? { content: item.input } : item);
    if (text) result.push({ id: item.id, turnId: turn.id, role: item.type === 'agentMessage' ? 'assistant' : 'user', phase: item.phase ?? null, text });
  }
  return result;
}
const timeOf=value=>Number.isFinite(value)&&value>0&&value<=8640000000000000?new Date(value).toISOString():null;
const publicStatus=value=>({inProgress:'running',in_progress:'running',running:'running',queued:'queued',completed:'completed',succeeded:'completed',failed:'failed',declined:'failed',cancelled:'cancelled',interrupted:'cancelled'}[status(value)]??'unknown');
/** A bounded structural projection, never a transport for command text, arguments, output or reasoning. */
export function toolsOf(state,{limit=200}={}) {
  const turn=turnsOf(state).at(-1),records=[],size=Number.isSafeInteger(limit)&&limit>0?Math.min(limit,500):200;
  const kinds={commandExecution:'command',mcpToolCall:'mcp',fileChange:'file-change'};
  for(const item of turn?.items??[]){
    const kind=kinds[item.type];if(!kind||typeof item.id!=='string'||!item.id||item.id.length>256)continue;
    const tool={id:item.id,turnId:turn.id,kind,status:publicStatus(item.status),startedAt:timeOf(item.startedAtMs),finishedAt:timeOf(item.completedAtMs)};
    if(typeof status(item.status)==='string'&&/^[A-Za-z_-]{1,64}$/.test(status(item.status)))tool.nativeStatus=status(item.status);
    if(Number.isFinite(item.durationMs)&&item.durationMs>=0)tool.durationMs=item.durationMs;
    if(kind==='command'&&Number.isSafeInteger(item.exitCode))tool.exitCode=item.exitCode;
    // Only native identifier fields are optional labels. All payloads stay native.
    if(kind==='mcp')for(const key of ['server','tool'])if(typeof item[key]==='string'&&/^[A-Za-z0-9_.:/-]{1,120}$/.test(item[key]))tool[key]=item[key];
    if(kind==='file-change'&&Array.isArray(item.changes))tool.changeCount=item.changes.length;
    records.push(tool);
  }
  return {scope:'latest-turn',turnId:turn?.id??null,records:records.slice(-size),total:records.length,truncated:records.length>size};
}
export function outcomeOf(state) {
  const turn=turnsOf(state).at(-1);if(!turn)return null;
  return {turnId:turn.id,status:publicStatus(turn.status),startedAt:timeOf(turn.turnStartedAtMs??turn.startedAtMs),finishedAt:timeOf(turn.completedAtMs??turn.turnCompletedAtMs)};
}
export const CONVERSATION_VIEW_CAPABILITIES=Object.freeze({toolEvents:'native-metadata-v1',toolKinds:Object.freeze(['command','mcp','file-change']),publicQuestions:'single-text-v1',nativeApprovals:true,privateInput:'native-only',turnOutcomes:true});
export function summaryOf(snapshot) {
  const state = snapshot.state, turnId = activeTurn(state), questions = questionsOf(state);
  const answered=answeredQuestionIds(state);
  let approvals = false,privateInput=[...privateQuestionIds(state)].some(id=>!answered.has(id)); const plan = planOf(state);
  for(const item of nativeRequests(state)) { if (typeof item.method === 'string' && /requestApproval|requestPermissions/.test(item.method)) approvals = true;
    if(item.method==='item/tool/requestUserInput'&&item.params?.turnId===turnId&&Array.isArray(item.params?.questions)&&item.params.questions.some(q=>q.isSecret))privateInput=true;
  }
  return { threadId: state.id ?? null, title: state.title ?? state.name ?? '', turnId, status: approvals ? 'approval' : questions.length ? 'question' : turnId ? 'running' : 'idle', questions, approvals,privateInput, plan, nativeRevision: snapshot.revision,viewCapabilities:CONVERSATION_VIEW_CAPABILITIES,lastTurn:outcomeOf(state),tools:toolsOf(state) };
}
export function pageMessages(messages, offset, limit) {
  let bytes = 0, end = offset;
  const records = [];
  for (const message of messages.slice(offset, offset + limit)) {
    const text = message.text.slice(0, 32000), cost = Buffer.byteLength(text) + 512;
    if (bytes + cost > 256 * 1024 && records.length) break;
    bytes += cost; end++;
    records.push({ ...message, text, truncated: text.length !== message.text.length });
  }
  return { records, total: messages.length, nextOffset: end < messages.length ? end : null };
}
