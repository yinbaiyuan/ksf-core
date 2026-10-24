import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { hostIdentity, sessionKey, managedPath } from '../routing/storage.js';
import { encode, keys, isToken, text, fail, validateReport, validateBindings } from '../routing/schema.js';
import { definitionContext, resolveReport, prepareBindings } from '../routing/definitions.js';
import { sha256 } from '../shared/hash.js';
import { readTurn } from './storage.js';
import { config } from './storage.js';
import { readUserData } from '../services/user-data.js';

export const MARKER = 'KSF_TASK_RECEIPT:';
const protocol = 'ksf-task-declaration-v1';
function sign(root, body) {
  const secret = readFileSync(managedPath(root, '.agents/runtime-data/routing/v1/identity.key'));
  if (secret.length !== 32) fail('TASK_KEY_INVALID', 'Invalid local identity key.');
  return createHmac('sha256', secret).update(encode(body)).digest('hex');
}
// Pure read-only declaration. The collector is the only writer of host transcripts.
export function declareTask({ root, input, env = process.env, now = new Date().toISOString() }) {
  keys(input, ['identity', 'turnId', 'eventId', 'policy', 'reason', 'report', 'targetBindings'], 'task declaration');
  if (!config(root)?.enabled) fail('TASK_CAPTURE_DISABLED', 'Enable task capture before declaring a turn.');
  const identity = hostIdentity(input.identity, env);
  if (identity.host !== 'codex' || !isToken(input.turnId) || !isToken(input.eventId) ||
      !['capture', 'exclude', 'pause', 'resume'].includes(input.policy) || !text(input.reason, 2000)) fail('INVALID_ARGUMENTS', 'Supply native turnId, unique eventId, policy and a short explicit reason.');
  const taskId = sessionKey(root, identity);
  if (!taskId) fail('TASK_KEY_INVALID', 'Task identity is not initialized.');
  validateBindings(input.targetBindings);
  if (input.targetBindings?.length && !input.report) fail('INVALID_ARGUMENTS', 'Bindings require a route report using the target.');
  const targets = input.report ? [input.report.ownership?.target, ...(input.report.relatedTargets ?? [])].filter(Boolean) : [];
  const modern = input.targetBindings?.length || targets.some(t => t.targetId || t.lifecycle || ['ability', 'archive'].includes(t.kind));
  const requestDigest = modern ? sha256(encode({ ...input, identity: undefined })) : undefined;
  if (modern) {
    const prior = readTurn(root, taskId, input.turnId)?.declarations.find(d => d.eventId === input.eventId && d.requestDigest);
    if (prior) {
      if (prior.requestDigest !== requestDigest) fail('TASK_DECLARATION_CONFLICT', 'eventId was already declared with different content.');
      return { receipt: MARKER + Buffer.from(encode({ ...prior, signature: sign(root, prior) })).toString('base64url'), declaration: prior, readOnly: true };
    }
  }
  let snapshot = null, targetChanges = [];
  const context = definitionContext(root);
  context.targetSeed = createHmac('sha256', taskId).update(JSON.stringify([input.turnId, input.eventId])).digest('hex');
  if (input.report !== undefined) {
    validateReport(input.report);
    if (readUserData({ root, namespace: 'settings' }).values.routing?.enabled !== false) {
      prepareBindings(context, input.targetBindings); snapshot = resolveReport(context, input.report);
      targetChanges = [...context.targetChanges.values()];
    }
  }
  const body = { protocol, taskId, turnId: input.turnId, eventId: input.eventId, policy: input.policy,
    reason: input.reason, snapshot, at: now, ...(requestDigest ? { requestDigest } : {}), ...(targetChanges.length ? { targetChanges } : {}),
    roundId: createHmac('sha256', taskId).update(input.turnId).digest('hex') };
  const receipt = { ...body, signature: sign(root, body) };
  return { receipt: MARKER + Buffer.from(encode(receipt)).toString('base64url'), declaration: body, readOnly: true };
}
export function receipts(root, output, taskId, turnId) {
  const found = [];
  const string = typeof output === 'string' ? output : JSON.stringify(output);
  for (const match of string.matchAll(/KSF_TASK_RECEIPT:([A-Za-z0-9_-]+)/g)) {
    try {
      const { signature, ...body } = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
      if (body.protocol !== protocol || body.taskId !== taskId || body.turnId !== turnId || !isToken(body.eventId) ||
          !['capture', 'exclude', 'pause', 'resume'].includes(body.policy) || !text(body.reason, 2000) ||
          typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) continue;
      if (timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(root, body), 'hex'))) found.push(body);
    } catch { /* User quotations and incomplete or foreign receipts are not declarations. */ }
  }
  return found;
}
