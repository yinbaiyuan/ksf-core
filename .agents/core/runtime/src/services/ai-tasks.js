import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createAITaskService } from '../ai-tasks/service.js';
import { createResponsesExecutor } from '../ai-tasks/executors/api-text.js';
import { createCodexExecutor } from '../ai-tasks/executors/codex.js';
import { createTranscriptionExecutor } from '../ai-tasks/executors/api-transcription.js';
import { createDeepSeekExecutor } from '../ai-tasks/executors/deepseek.js';

export function createWorkbenchAI(root, options = {}) {
  const ai = createAITaskService(root, { ...options, executors: { 'deepseek-responses-v1': createDeepSeekExecutor(options), 'openai-responses-v1': createResponsesExecutor(options), 'openai-transcription-v1':createTranscriptionExecutor(options),codex: createCodexExecutor(), ...options.executors } });
  // A fresh workspace remains untouched until first use. Existing queues resume
  // even when no application window is open.
  if (options.autoStart!==false&&existsSync(join(root, '.agents/user-data/ai'))) void ai.start().catch(() => {});
  return ai;
}
