import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { taskProjectFixture } from './task-project-fixture.js';
import { validateReport } from '../../src/routing/schema.js';
import { definitionContext, resolveReport } from '../../src/routing/definitions.js';
export function addKnowledgeUnit(root, name = '认知-业务公式', entry = 'cognition.md') {
  const path = `知识/${name}/${entry}`, file = join(root, path), navigation = join(root, '知识/knowledge.md');
  mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, `# ${name}\n\n验收示例，不代表已更新知识。\n`);
  const old = existsSync(navigation) ? readFileSync(navigation, 'utf8') : '# 知识单元\n';
  writeFileSync(navigation, old + `\n[${name}](<${name}/${entry}>)\n`);
  return { kind: 'knowledge', path };
}
export function targetReport(target, relatedTargets = [], summary = '讨论并完善知识单元') {
  return { summary, status: 'working', ownership: target ? { state: 'bound', target } : { state: 'none' }, relatedTargets, abilities: [] };
}
export function taskTargetFixture(t) {
  const f = taskProjectFixture(t);
  for (const p of Object.values(f.projects)) f.addProject(p.name);
  const knowledge = addKnowledgeUnit(f.root), relatedKnowledge = addKnowledgeUnit(f.root, '认知-时间管理', 'overview.md');
  const projectTarget = name => ({ kind: 'project', name: f.projects[name].name, scope: 'current' });
  const snapshot = (target, related = [], summary) => { const r = targetReport(target, related, summary); validateReport(r); return resolveReport(definitionContext(f.root), r); };
  f.save('knowledge', 9, [snapshot(knowledge, [projectTarget('B')])]);
  f.save('switch', 10, [snapshot(projectTarget('A')), snapshot(knowledge), snapshot(projectTarget('A'), [relatedKnowledge])]);
  f.save('related-only', 11, [snapshot(projectTarget('B'), [knowledge, relatedKnowledge], '关联知识仍是项目任务')]);
  return { ...f, knowledge, relatedKnowledge, projectTarget, snapshot, knowledgeKey: `knowledge:${knowledge.path}` };
}
