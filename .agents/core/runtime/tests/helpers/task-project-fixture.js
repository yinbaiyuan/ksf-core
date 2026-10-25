import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { routingFixture } from './routing-fixture.js';
import { ARCHIVE, PROTOCOL } from '../../src/task-capture/storage.js';
export function taskProjectFixture(t) {
  const f = routingFixture(t), taskId = 'a'.repeat(64);
  const projects = Object.fromEntries(['A', 'B', 'C'].map(name => [name, { name: `[验收示例] 项目 ${name}`, scope: 'current', path: `项目/${name}/project.md` }]));
  const route = (name, references = [], summary = '核对项目安排') => ({ summary, status: 'completed', project: name ? { state: 'bound', primary: projects[name] } : { state: 'none' }, references: references.map(n => projects[n]), abilities: [] });
  const at = n => new Date(Date.UTC(2026, 0, 2, 0, n)).toISOString();
  function save(turnId, index, snapshots, { id = taskId, policy = 'capture' } = {}) {
    const dir = join(f.root, ARCHIVE, id, 'turns'); mkdirSync(dir, { recursive: true });
    const routes = snapshots.map((snapshot, i) => ({ eventId: `${turnId}-${i}`, roundId: turnId, at: at(index + i / 10), reason: 'Agent 明确上报的验收示例', snapshot }));
    const value = { protocol: PROTOCOL, taskId: id, turnId, roundId: turnId, revision: 1, policy, status: policy === 'exclude' ? 'excluded' : 'completed', startedAt: at(index), updatedAt: at(index), completedAt: at(index), declarations: [], issues: [], messages: policy === 'exclude' ? [] : [{ id: `${turnId}-u`, role: 'user', phase: 'user', at: at(index), content: [{ type: 'input_text', text: `[验收示例] 第 ${index} 轮用户要求` }], revisions: [] }, { id: `${turnId}-f`, role: 'assistant', phase: 'final_answer', at: at(index), content: [{ type: 'output_text', text: '完成本轮核对。\n\n| 项目 | 结论 |\n| --- | --- |\n| 示例 | 已记录 |\n\n```js\nconst result = true;\n```\n\n[危险链接](javascript:alert(1))\n<script>alert(1)</script>' }], revisions: [] }], routes };
    writeFileSync(join(dir, `${turnId}.json`), JSON.stringify(value)); return value;
  }
  save('one', 1, [route('A', ['A', 'C'], '历史专属词：工作台设计')]);
  save('two', 2, [route('B')]); save('three', 3, [route('A')]); save('four', 4, [route('A', ['C']), route('B', ['C'])]);
  save('five', 5, [route(null)]); save('six', 6, [{ ...route(null), project: { state: 'unresolved' } }]);
  save('seven', 7, []); save('eight', 8, [], { policy: 'exclude' });
  return { ...f, taskId, projects, route, save, key: name => `current:${projects[name].name}` };
}
