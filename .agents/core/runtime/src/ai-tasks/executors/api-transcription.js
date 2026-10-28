import { credential } from '../profiles.js';
import { readMaterial } from '../materials.js';
import { fail, requireAI } from '../schema.js';
import { boundedResponse, httpFailure } from './api-text.js';

export function createTranscriptionExecutor({ fetcher = fetch } = {}) {
  return {async check({connection,env}){credential(connection,env);return{ready:true,scope:'local-configuration',message:'转写协议及后台凭据引用可用；音频模型和实际转写仍需验收。'};}, async execute({ task, store, signal, env }) {
    const { connection, profile, materials } = task.snapshot;
    requireAI(task.request.inputs.length === 1 && task.request.inputs[0].kind === 'material' && materials.length === 1, 'AI_REQUEST_INVALID', '转写任务需要单个音频材料。');
    const audio = materials[0];
    requireAI(audio.mimeType.startsWith('audio/') && /\.(mp3|mp4|mpeg|mpga|m4a|wav|webm)$/i.test(audio.name), 'AI_CAPABILITY_UNSUPPORTED', '转写材料的 MIME 或格式不支持。');
    requireAI(audio.size <= 25 * 1024 * 1024, 'AI_INPUT_TOO_LARGE', '此转写协议单次音频上限 25 MiB，请由应用分段。');
    const key = credential(connection, env), bytes = await readMaterial(store, audio);
    const form = new FormData(); form.append('file', new Blob([bytes], { type: audio.mimeType }), audio.name); form.append('model', profile.model); form.append('response_format', 'json');
    // Transcript instructions are vocabulary hints here, never arbitrary model
    // options or fabricated timing/diarization requests.
    form.append('prompt', task.request.instruction);
    signal.throwIfAborted();
    let response;
    try { response = await fetcher(connection.baseURL.replace(/\/$/, '') + '/audio/transcriptions', { method: 'POST', redirect: 'error', signal, headers: { Authorization: `Bearer ${key}` }, body: form }); }
    catch { throw fail('AI_EXECUTION_UNKNOWN', '音频已提交但转写响应未知。', { outcomeUnknown: true }); }
    if (!response.ok) { await response.body?.cancel(); throw httpFailure(response.status); }
    let result; try { result = await boundedResponse(response, 2 * 1024 * 1024); } catch { throw fail('AI_EXECUTION_UNKNOWN', '转写响应未完整取得。', { outcomeUnknown: true }); }
    requireAI(typeof result.text === 'string', 'AI_PROTOCOL_INVALID', '转写 API 未返回文本。');
    return { text: JSON.stringify({ text: result.text, segments: null, speakers: null }), usage: null, warnings: ['此配置只取得文本；时间戳与说话人未提供。'], execution: { actualModel: profile.model } };
  } };
}
