import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import YAML from '../../src/vendor/yaml/dist/index.js';
import { types, protectedPaths } from '../../src/objects/schema.js';
import { objectQuery } from '../../src/services/objects.js';
import { project } from '../../src/services/projects.js';
import { mutateRoute } from '../../src/services/routes.js';

export function routingFixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'ksf-routing-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const def of Object.values(types)) for (const source of ['system', 'user']) mkdirSync(join(root, def[source]), { recursive: true });
  mkdirSync(join(root, '项目'));
  const add = (id = 'partner.test.method', source = 'user', base = root) => {
    const type = id.split('.')[0], path = join(base, protectedPaths[id] ?? `${types[type][source === 'system' ? 'system' : 'user']}/${id}/${types[type].entry}`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `---\n${YAML.stringify({ id, name: '测试方法', description: '测试能力', version: '0.1.0', status: 'active', ...(source === 'user' ? { user_revision: 1 } : {}) })}---\n# Method\n`);
    return path;
  };
  const ability = (id, source = 'effective', stage = 'adopted') => {
    const result = objectQuery({ root, type: id.split('.')[0], operation: 'read', reference: `${id}@0.1.0`, source }).data.object;
    return { ref: `${id}@0.1.0`, source: result.source, stage, definitionDigest: result.definition_digest };
  };
  const addProject = name => project({ root, operation: 'write', name, data: { body: `# ${name}\n` } });
  const report = (overrides = {}) => ({ summary: '实现路由记录', status: 'working', project: { state: 'none' }, references: [], abilities: [], ...overrides });
  const identity = { host: 'test', sessionId: 'private-native-session-id' };
  const start = (overrides = {}, identityOverride = identity) => mutateRoute({ root, operation: 'start', input: { eventId: 'start', identity: identityOverride, report: report(overrides) }, ifMatch: 'missing', env: {} });
  return { root, add, ability, addProject, report, identity, start };
}
