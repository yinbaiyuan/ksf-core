// Lifecycle data is never interpreted as an instruction or an executable path.
export const incubationDomains = ['collaboration.user', 'instance', 'device', 'service', 'capture'];
export const incubationError = (code, message, data) => Object.assign(new Error(message), {code, data, status: /CONFLICT|LOCKED/.test(code) ? 409 : 400});
const fail = message => { throw incubationError('INCUBATION_INVALID', message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function keys(value, allowed) { if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('孵化数据包含未知字段或格式。'); }
export const validVersion = value => value === 'missing' || typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function label(value, maximum) { if (typeof value !== 'string' || !value.trim() || [...value].length > maximum || /[\p{Cc}\p{Cf}]/u.test(value)) fail('名称需要有效的可见字符。'); }
export function validateIncubationDraft(value) {
  keys(value, ['userLabel','instanceName','deviceName','autostart','userText','userEtag','openWorkbench','deferService','captureEnabled']);
  for (const key of ['userLabel','instanceName','deviceName']) if (value[key] !== undefined) label(value[key], key === 'userLabel' ? 100 : 64);
  for (const key of ['autostart','openWorkbench','deferService','captureEnabled']) if (value[key] !== undefined && typeof value[key] !== 'boolean') fail(`${key} 需要布尔值。`);
  if (value.userText !== undefined && (typeof value.userText !== 'string' || Buffer.byteLength(value.userText) > 256 * 1024 || !validVersion(value.userEtag))) fail('USER 原文需要不超过 256 KiB，并提供 userEtag。');
  if (value.userEtag !== undefined && !validVersion(value.userEtag)) fail('userEtag 无效。');
}
export function validateIncubation(value) {
  keys(value, ['status','draft','baselines','operation','completedAt','skippedAt']);
  // Patches may omit status; a persisted document is checked by its consumer too.
  if (value.status !== undefined && !['pending','completed','skipped'].includes(value.status)) fail('未知孵化状态，请保留原件。');
  if (value.draft !== undefined) validateIncubationDraft(value.draft);
  if (value.baselines !== undefined) {
    keys(value.baselines, incubationDomains);
    if (Object.values(value.baselines).some(version => !validVersion(version))) fail('配置基线版本无效。');
  }
  for (const key of ['completedAt','skippedAt']) if (value[key] !== undefined && (typeof value[key] !== 'string' || !Number.isFinite(Date.parse(value[key])))) fail('孵化时间无效。');
  if (value.operation !== undefined && value.operation !== null) {
    const op = value.operation; keys(op, ['id','kind','targets','steps','workbench']);
    if (!['finish','skip'].includes(op.kind)) fail('孵化操作类型无效。');
    if (typeof op.id !== 'string' || !/^[a-f0-9-]{36}$/.test(op.id)) fail('孵化操作标识无效。');
    if (!Array.isArray(op.targets) || op.targets.length > incubationDomains.length || new Set(op.targets.map(target => target.domain)).size !== op.targets.length) fail('孵化配置清单无效。');
    for (const target of op.targets) {
      keys(target, ['domain','values','beforeEtag']);
      if (!incubationDomains.includes(target.domain) || !object(target.values) || !validVersion(target.beforeEtag)) fail('孵化配置目标无效。');
      const fields = {'collaboration.user':['text'],instance:['name'],device:['name'],service:['autostart'],capture:['enabled']}[target.domain];
      keys(target.values, fields);
    }
    keys(op.steps, incubationDomains);
    for (const step of Object.values(op.steps)) {
      keys(step, ['state','etag','error']);
      if (!['saved','failed','deferred'].includes(step.state) || step.etag !== undefined && !validVersion(step.etag)) fail('孵化步骤回执无效。');
      if (step.error !== undefined) { keys(step.error,['code','message']); if (typeof step.error.code !== 'string' || typeof step.error.message !== 'string') fail('步骤错误回执无效。'); }
    }
    keys(op.workbench, ['state','url','error']);
    if (!['pending','suppressed','requested','opened','failed'].includes(op.workbench.state)) fail('工作台打开回执无效。');
    for (const key of ['url','error']) if (op.workbench[key] !== undefined && typeof op.workbench[key] !== 'string') fail('工作台回执无效。');
  }
}
