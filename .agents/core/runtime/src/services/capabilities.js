import { objectQuery } from './objects.js';
import { problem, assert } from './workbench-common.js';

// Root-bound, read-only definition resolution. Never accepts a filesystem path or mutation.
export function createCapabilities(root) {
  return { read(input) {
    assert(input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).every(k => ['ref', 'source'].includes(k)), 'CAPABILITY_ARGUMENT', '能力读取参数无效。');
    const query = { root, type: 'competency', reference: input.ref, source: input.source ?? 'effective' };
    const checked = objectQuery({ ...query, operation: 'check' });
    if (!checked.data.valid || checked.errors.length) throw problem('CAPABILITY_UNAVAILABLE', checked.errors[0]?.message ?? '基本功当前不可读取。', 409);
    const result = objectQuery({ ...query, operation: 'read' });
    const before = checked.data.object, after = result.data.object;
    assert(!result.errors.length && ['source','version','user_revision','path'].every(k => before[k] === after[k]), 'CAPABILITY_CHANGED', '能力定义读取期间变化，请重新核对。', 409);
    return result.data.object;
  } };
}
