import { isAbsolute, join } from 'node:path';
import { atomicJSON, readJSON } from './store.js';
import { exact, identifier, integer, requireAI, clone } from './schema.js';

export async function readConfig(home, kind) {
  const config = await readJSON(join(home, kind + '.json'), { schemaVersion: 1, revision: 0, items: [] });
  requireAI(config.schemaVersion === 1 && Number.isSafeInteger(config.revision) && Array.isArray(config.items), 'AI_STORAGE_VERSION', 'AI 配置版本未知或损坏。');
  return config;
}
export function connectionContract(item) {
  exact(item, ['id', 'kind', 'enabled', 'protocolId', 'baseURL', 'credentialRef', 'concurrency', 'executablePath', 'codexHome']);
  identifier(item.id); requireAI(typeof item.enabled === 'boolean', 'AI_REQUEST_INVALID', '连接需要 enabled。');
  integer(item.concurrency, 1, 8);
  requireAI(['api', 'codex'].includes(item.kind), 'AI_REQUEST_INVALID', '连接类型只支持 api/codex。');
  if (item.kind === 'api') {
    requireAI(['deepseek-responses-v1', 'openai-responses-v1', 'openai-transcription-v1'].includes(item.protocolId), 'AI_CAPABILITY_UNSUPPORTED', '未知 API 协议。');
    let url; try { url = new URL(item.baseURL); } catch {}
    requireAI(url && url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, 'AI_REQUEST_INVALID', 'API 地址需要不含凭据的 HTTPS 基础地址。');
    requireAI(typeof item.credentialRef === 'string' && /^env:[A-Z_][A-Z0-9_]{0,127}$/.test(item.credentialRef), 'AI_REQUEST_INVALID', '凭据需要 env:变量名 引用。');
    requireAI(item.executablePath === undefined && item.codexHome === undefined, 'AI_REQUEST_INVALID', 'API 连接不能配置 CLI 字段。');
  } else {
    requireAI(typeof item.executablePath === 'string' && isAbsolute(item.executablePath) && (!item.codexHome || isAbsolute(item.codexHome)), 'AI_REQUEST_INVALID', 'Codex 路径和认证目录需要绝对路径。');
    requireAI(item.baseURL === undefined && item.credentialRef === undefined && item.protocolId === undefined, 'AI_REQUEST_INVALID', 'Codex 使用运行账号认证目录，不使用 API 连接字段。');
  }
  return clone(item);
}
export function profileContract(item) {
  exact(item, ['id', 'executorId', 'enabled', 'model', 'timeoutMs', 'maxAttempts', 'retryDelayMs', 'maxInputBytes', 'maxOutputBytes', 'maxOutputTokens', 'reasoningEffort']);
  identifier(item.id); identifier(item.executorId); requireAI(typeof item.enabled === 'boolean', 'AI_REQUEST_INVALID', '配置需要 enabled。');
  requireAI(item.model === undefined || typeof item.model === 'string' && item.model.length > 0 && item.model.length <= 128, 'AI_REQUEST_INVALID', '模型名无效。');
  integer(item.timeoutMs, 1000, 3600000); integer(item.maxAttempts, 1, 5); integer(item.retryDelayMs, 0, 60000);
  integer(item.maxInputBytes, 1, 128 * 1024 * 1024); integer(item.maxOutputBytes, 1, 512 * 1024);
  if (item.maxOutputTokens !== undefined) integer(item.maxOutputTokens, 1, 128000);
  if (item.reasoningEffort !== undefined) requireAI(['minimal', 'low', 'medium', 'high'].includes(item.reasoningEffort), 'AI_REQUEST_INVALID', '不支持的推理设置。');
  return clone(item);
}
export async function writeConfig(home, kind, input) {
  exact(input, ['revision', 'items']);
  const current = await readConfig(home, kind);
  requireAI(input.revision === current.revision, 'AI_CONFIG_CONFLICT', '配置已变化，请刷新后修改。', { status: 409 });
  requireAI(Array.isArray(input.items) && input.items.length <= 64, 'AI_REQUEST_INVALID', '配置列表过大。');
  const items = input.items.map(kind === 'connections' ? connectionContract : profileContract);
  requireAI(new Set(items.map(item => item.id)).size === items.length, 'AI_REQUEST_INVALID', '配置标识重复。');
  const next = { schemaVersion: 1, revision: current.revision + 1, items };
  await atomicJSON(join(home, kind + '.json'), next); return next;
}
export function credential(connection, env = process.env) {
  const value = env[connection.credentialRef?.slice(4)];
  requireAI(typeof value === 'string' && value.length > 0, 'AI_AUTH_REQUIRED', '后台服务缺少连接所引用的环境凭据。');
  return value;
}
