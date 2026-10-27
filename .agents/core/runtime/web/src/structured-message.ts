import type { Message } from './types.ts';
export const messageText = (message: Message) => message.content.filter(c => ['text', 'input_text', 'output_text'].includes(c.type)).map(c => c.text ?? '').join('\n');
export interface Question { id: string; question: string; options?: { label: string; description: string }[] }
export interface QA { question: string; answer?: string; options?: Question['options'] }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function questions(message: Message): Question[] | null {
  if (message.phase !== 'question' || message.role !== 'assistant') return null;
  try { const v = JSON.parse(messageText(message));
    if (!object(v) || Object.keys(v).some(k => k !== 'questions') || !Array.isArray(v.questions) || !v.questions.length) return null;
    if (v.questions.every(q => object(q) && Object.keys(q).every(k => ['title', 'options'].includes(k)) && typeof q.title === 'string' && (!('options' in q) || Array.isArray(q.options) && q.options.every(o => typeof o === 'string')))) return v.questions.map(q => ({ id: '', question: q.title, options: q.options?.map((label: string) => ({ label, description: '' })) }));
    if (!v.questions.every(q => object(q) && Object.keys(q).every(k => ['id', 'header', 'question', 'options'].includes(k)) && typeof q.id === 'string' && typeof q.question === 'string' && (!('options' in q) || Array.isArray(q.options) && q.options.every(o => object(o) && Object.keys(o).every(k => ['label', 'description'].includes(k)) && typeof o.label === 'string' && typeof o.description === 'string')))) return null;
    return v.questions;
  } catch { return null; }
}
export function asyncAnswers(message: Message): QA[] | null {
  if (message.role !== 'user') return null;
  const match = messageText(message).trim().match(/^<send_user_message_question_reply>\s*([\s\S]+?)\s*<\/send_user_message_question_reply>$/);
  if (!match) return null;
  try { const v = JSON.parse(match[1]);
    if (!Array.isArray(v) || !v.length || !v.every(q => object(q) && Object.keys(q).every(k => ['questionItemId', 'question', 'answer'].includes(k)) && typeof q.questionItemId === 'string' && typeof q.question === 'string' && typeof q.answer === 'string')) return null;
    return v.map(q => ({ question: q.question, answer: q.answer }));
  } catch { return null; }
}
export function structuredMessage(message: Message, known: Map<string, string> = new Map()): QA[] | null {
  const async = asyncAnswers(message); if (async) return async;
  const qs = questions(message); if (qs) return qs.map(q => ({ question: q.question, options: q.options }));
  if (message.role !== 'user' || message.phase !== 'answer') return null;
  try { const v = JSON.parse(messageText(message));
    if (!object(v) || !Object.keys(v).length || !Object.entries(v).every(([id, a]) => known.has(id) && object(a) && Object.keys(a).every(k => k === 'answers') && Array.isArray(a.answers) && a.answers.length && a.answers.every(s => typeof s === 'string'))) return null;
    return Object.entries(v).map(([id, a]) => ({ question: known.get(id)!, answer: (a as { answers: string[] }).answers.join('\n') }));
  } catch { return null; }
}

/** Associate answers with the preceding question, even when a later prompt reuses an ID. */
export function questionContexts(messages: Message[]) {
  const current = new Map<string, string>(), contexts = new Map<string, Map<string, string>>();
  for (const message of messages) {
    for (const q of questions(message) ?? []) if (q.id) current.set(q.id, q.question);
    contexts.set(message.id, new Map(current));
  }
  return contexts;
}
