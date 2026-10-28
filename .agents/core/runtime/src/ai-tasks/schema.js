import { createHash } from 'node:crypto';

export const terminal = status => ['succeeded', 'failed', 'cancelled'].includes(status);
export const fail = (code, message, extra = {}) => Object.assign(new Error(message), { code, status: 400, ...extra });
export function requireAI(condition, code, message, extra) { if (!condition) throw fail(code, message, extra); }
export const clone = value => JSON.parse(JSON.stringify(value));
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
export function exact(value, allowed) { requireAI(object(value) && Object.keys(value).every(key => allowed.includes(key)), 'AI_REQUEST_INVALID', '对象包含不支持的字段。'); }
export function identifier(value) { requireAI(typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value), 'AI_REQUEST_INVALID', '标识格式无效。'); return value; }
export function integer(value, min, max) { requireAI(Number.isSafeInteger(value) && value >= min && value <= max, 'AI_REQUEST_INVALID', '数值超出允许范围。'); return value; }
const types = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
const schemaKeys = ['type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const', 'anyOf', 'description', 'title', 'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems'];
// A deliberately explicit subset, shared by every executor. Unknown keywords fail
// at submission instead of being silently ignored by a partial validator.
export function checkSchema(schema, depth = 0) {
  exact(schema, schemaKeys);
  requireAI(depth < 16, 'AI_REQUEST_INVALID', '输出结构嵌套过深。');
  const declared = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  requireAI(declared.every(type => types.includes(type)) && (declared.length || schema.anyOf || schema.enum || Object.hasOwn(schema, 'const')), 'AI_REQUEST_INVALID', '输出结构缺少有效类型。');
  if (schema.anyOf) { requireAI(Array.isArray(schema.anyOf) && schema.anyOf.length > 0 && schema.anyOf.length <= 16, 'AI_REQUEST_INVALID', 'anyOf 无效。'); schema.anyOf.forEach(item => checkSchema(item, depth + 1)); }
  if (schema.properties !== undefined) { requireAI(object(schema.properties), 'AI_REQUEST_INVALID', 'properties 无效。'); Object.values(schema.properties).forEach(item => checkSchema(item, depth + 1)); }
  if (schema.required !== undefined) requireAI(Array.isArray(schema.required) && schema.required.every(key => typeof key === 'string' && Object.hasOwn(schema.properties ?? {}, key)), 'AI_REQUEST_INVALID', 'required 无效。');
  if (schema.additionalProperties !== undefined) requireAI(typeof schema.additionalProperties === 'boolean', 'AI_REQUEST_INVALID', 'additionalProperties 只支持布尔值。');
  if (schema.items) checkSchema(schema.items, depth + 1);
  if (declared.includes('array')) requireAI(object(schema.items), 'AI_REQUEST_INVALID', '数组必须声明 items。');
  if (schema.enum) requireAI(Array.isArray(schema.enum) && schema.enum.length > 0, 'AI_REQUEST_INVALID', 'enum 无效。');
  for (const key of ['minimum', 'maximum']) if (schema[key] !== undefined) requireAI(Number.isFinite(schema[key]), 'AI_REQUEST_INVALID', '数值约束无效。');
  for (const key of ['minLength', 'maxLength', 'minItems', 'maxItems']) if (schema[key] !== undefined) integer(schema[key], 0, 1000000);
}
export function matchesSchema(value, schema) {
  if (schema.anyOf && !schema.anyOf.some(item => matchesSchema(value, item))) return false;
  if (schema.enum && !schema.enum.some(item => canonical(item) === canonical(value))) return false;
  if (Object.hasOwn(schema, 'const') && canonical(schema.const) !== canonical(value)) return false;
  const declared = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (declared.length && !declared.some(type => type === 'null' ? value === null : type === 'object' ? object(value) : type === 'array' ? Array.isArray(value) : type === 'integer' ? Number.isSafeInteger(value) : type === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === type)) return false;
  if (object(value)) {
    if ((schema.required ?? []).some(key => !Object.hasOwn(value, key))) return false;
    if (schema.additionalProperties === false && Object.keys(value).some(key => !Object.hasOwn(schema.properties ?? {}, key))) return false;
    if (Object.entries(schema.properties ?? {}).some(([key, item]) => Object.hasOwn(value, key) && !matchesSchema(value[key], item))) return false;
  }
  if (Array.isArray(value) && ((schema.items && !value.every(item => matchesSchema(item, schema.items))) || value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity))) return false;
  if (typeof value === 'string' && ([...value].length < (schema.minLength ?? 0) || [...value].length > (schema.maxLength ?? Infinity))) return false;
  if (typeof value === 'number' && (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) return false;
  return true;
}
export function strictSchema(schema) {
  if ((Array.isArray(schema.type)?schema.type:[schema.type]).includes('object')) requireAI(schema.additionalProperties === false && Object.keys(schema.properties ?? {}).every(key => schema.required?.includes(key)), 'AI_CAPABILITY_UNSUPPORTED', '原生结构化输出需要对象禁用额外属性并将所有字段设为 required；可空值用 null 类型。');
  for (const item of Object.values(schema.properties ?? {})) strictSchema(item);
  if (schema.items) strictSchema(schema.items);
  schema.anyOf?.forEach(strictSchema);
}
export function requestContract(input) {
  exact(input, ['contractVersion', 'idempotencyKey', 'profileId', 'instruction', 'inputs', 'outputSpec', 'context', 'requirements', 'deadlineAt', 'limits', 'methodRefs']);
  requireAI(input.contractVersion === 'ai-task-v1', 'AI_REQUEST_INVALID', '不支持的 AI 请求契约版本。');
  requireAI(typeof input.idempotencyKey === 'string' && input.idempotencyKey.length > 0 && input.idempotencyKey.length <= 256, 'AI_REQUEST_INVALID', '需要稳定的幂等键。');
  identifier(input.profileId);
  requireAI(typeof input.instruction === 'string' && input.instruction.trim().length > 0 && input.instruction.length <= 65536, 'AI_REQUEST_INVALID', '任务指令为空或过长。');
  requireAI(Array.isArray(input.inputs) && input.inputs.length <= 64, 'AI_REQUEST_INVALID', 'inputs 必须是有界数组。');
  for (const item of input.inputs) {
    exact(item, item?.kind === 'text' ? ['kind', 'name', 'text'] : ['kind', 'materialId', 'sha256']);
    requireAI(item.kind === 'text' ? typeof item.text === 'string' : item.kind === 'material' && /^[a-f0-9]{64}$/.test(item.sha256), 'AI_REQUEST_INVALID', '输入类型或材料摘要无效。');
    if (item.kind === 'material') identifier(item.materialId);
    if (item.name !== undefined) requireAI(typeof item.name === 'string' && item.name.length <= 256, 'AI_REQUEST_INVALID', '材料名无效。');
  }
  exact(input.outputSpec, ['format', 'mediaType', 'schema']);
  requireAI(['text', 'json'].includes(input.outputSpec.format), 'AI_REQUEST_INVALID', '输出格式只支持 text/json。');
  if (input.outputSpec.format === 'json') { checkSchema(input.outputSpec.schema);requireAI(input.outputSpec.schema.type==='object','AI_CAPABILITY_UNSUPPORTED','首版 JSON 输出根结构需要为 object。'); strictSchema(input.outputSpec.schema); }
  else requireAI(input.outputSpec.schema === undefined && [undefined, 'text/plain', 'text/markdown'].includes(input.outputSpec.mediaType), 'AI_REQUEST_INVALID', '文本输出约束无效。');
  if (input.deadlineAt !== undefined) requireAI(typeof input.deadlineAt === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.deadlineAt) && Number.isFinite(Date.parse(input.deadlineAt)), 'AI_REQUEST_INVALID', '截止时间需要完整时区。');
  if (input.requirements !== undefined) requireAI(Array.isArray(input.requirements) && input.requirements.length <= 32 && input.requirements.every(v => typeof v === 'string' && v.length <= 80), 'AI_REQUEST_INVALID', '能力要求无效。');
  // Method material is explicitly supplied as immutable text in v1. No implicit
  // ability routing or root/host conversation is loaded by this service.
  if (input.methodRefs !== undefined) requireAI(Array.isArray(input.methodRefs) && input.methodRefs.length === 0, 'AI_CAPABILITY_UNSUPPORTED', '首版请将明确选定的方法正文作为 text 输入；尚不支持自动解析 methodRefs。');
  if (input.context !== undefined) requireAI(object(input.context) && Buffer.byteLength(JSON.stringify(input.context)) <= 8192, 'AI_REQUEST_INVALID', '业务关联信息过大。');
  if (input.limits !== undefined) exact(input.limits, ['maxAttempts', 'timeoutMs', 'maxOutputBytes']);
  requireAI(Buffer.byteLength(JSON.stringify(input)) <= 768 * 1024, 'AI_INPUT_TOO_LARGE', '普通任务请求过大，请登记材料。');
  return clone(input);
}
export function outputValue(text, spec, maxBytes) {
  requireAI(typeof text === 'string' && Buffer.byteLength(text) <= maxBytes, 'AI_OUTPUT_INVALID', '输出缺失或超过大小上限。');
  if (spec.format === 'text') { requireAI(text.trim().length > 0, 'AI_OUTPUT_INVALID', '输出为空。'); return text; }
  let value; try { value = JSON.parse(text); } catch { throw fail('AI_OUTPUT_INVALID', '输出不是完整 JSON。', { retryable: true }); }
  requireAI(matchesSchema(value, spec.schema), 'AI_OUTPUT_INVALID', '输出未满足约定结构。', { retryable: true });
  return value;
}
