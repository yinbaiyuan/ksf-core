import { readFile } from 'node:fs/promises';
import { atomicJSON } from '../store.js';
import {collectExecutionArtifacts} from './execution-artifacts.js';
import { runCodex } from './codex-run.js';

const controller = new AbortController();
process.on('message', message => { if (message?.type === 'cancel') controller.abort(); });
process.on('disconnect', () => controller.abort());
process.on('SIGTERM', () => controller.abort());
if(!process.connected)controller.abort();
const spec = JSON.parse(await readFile(process.argv[2], 'utf8'));
let receipt;
try { const result = await runCodex(spec, { signal: controller.signal, onIdentity: async identity => { if (process.connected) process.send({ type: 'identity', identity }); } }); if(spec.execution)result.executionFiles=await collectExecutionArtifacts(spec.execution.work,spec.execution.before,spec.execution.artifactDirectory);receipt = { result }; }
catch (error) { receipt = { error: { code: error.code?.startsWith('AI_') ? error.code : 'AI_CLI_FAILED', message: 'Codex 执行失败或停止，请核对任务诊断。', outcomeUnknown: !!error.outcomeUnknown } }; }
await atomicJSON(spec.receiptPath, { schemaVersion: 1, aiTaskId: spec.aiTaskId, attemptId: spec.attemptId, ...receipt });
if (process.connected) process.send({ type: 'settled' });
process.exit(0);
