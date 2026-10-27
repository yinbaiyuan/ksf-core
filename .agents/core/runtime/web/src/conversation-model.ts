import type { Message } from './types.ts';
import { asyncAnswers } from './structured-message.ts';

/** Presentation only: message order, identity and archived content remain intact. */
export function partitionMessages(messages: Message[]) {
  const request: Message[] = [], result: Message[] = [], process: Message[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    if (message.role === 'user' && message.phase !== 'answer' && !asyncAnswers(message)) request.push(message);
    else if (message.role === 'assistant' && ['final', 'final_answer'].includes(message.phase)) result.push(message);
    else process.push(message);
  }
  return { request, result, process };
}

export type SectionId = 'request' | 'route' | 'result';
export function sectionTarget(section: string | null, oldTab: string | null): SectionId | null {
  if (section === 'request' || section === 'route' || section === 'result') return section;
  if (oldTab === 'conversation') return 'request';
  if (oldTab === 'route' || oldTab === 'routes') return 'route';
  return null;
}
