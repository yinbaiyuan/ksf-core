import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { copyTree, inventory, json, put, fail } from './files.js';
import { validateObject } from '../objects/schema.js';

const excluded = /(?:^|\/)(?:\.git|node_modules|_cache|_working|\.DS_Store)(?:\/|$)/;
const coreAccept = p => !excluded.test(p) && !/^(?:runtime\/(?:tests|src\/eval)|runtime\/src\/commands\/eval\.js|docs\/(?:cli\/eval|runtime\/routing-evaluation)\.md)(?:\/|$)/.test(p);
const gitInit = root => {
  const r = spawnSync('/usr/bin/git', ['init', '--template=', '--initial-branch=main', root], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });
  if (r.status !== 0) fail('EVAL_FIXTURE_GIT', r.stderr || 'Cannot initialize isolated source identity.');
};

// Freeze once before any subject runs. All repetitions derive from these exact working-tree bytes.
export function freezeInstance(root, destination) {
  mkdirSync(destination, { recursive: true });
  for (const p of ['AGENTS.md', '.agents/ksf', '.agents/ksf.ps1', '.agents/core']) {
    if (!existsSync(join(root, p))) fail('EVAL_FIXTURE_MISSING', `Missing ${p}`);
    copyTree(join(root, p), join(destination, p), p === '.agents/core' ? coreAccept : undefined);
  }
  for (const p of ['能力', '知识']) copyTree(join(root, p), join(destination, p), path => !excluded.test(path));
  if (existsSync(join(root, '项目'))) for (const name of readdirSync(join(root, '项目'))) {
    // Actual root cards provide discovery and actual project boundaries. Task fixtures are separate.
    const card = join(root, '项目', name, 'project.md');
    if (existsSync(card)) copyTree(card, join(destination, '项目', name, 'project.md'));
  }
  copyTree(join(root, '.agents/user-data/abilities'), join(destination, '.agents/user-data/abilities'));
  const sourcesFile = join(root, '.agents/user-data/sources.json');
  const mappings = [{ from: root, to: '.' }], sources = [];
  if (existsSync(sourcesFile)) {
    const registry = JSON.parse(readFileSync(sourcesFile, 'utf8'));
    for (const entry of registry.values?.entries ?? []) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(entry.id)) fail('EVAL_FIXTURE_SOURCE', 'Unsafe ability-source ID.');
      const source = resolve(root, entry.path), target = `repositories/${entry.id}`;
      if (!existsSync(join(source, 'ksf-source.yaml'))) fail('EVAL_FIXTURE_SOURCE', `Unavailable source ${entry.id}.`);
      copyTree(source, join(destination, target), p => !excluded.test(p));
      sources.push({ id: entry.id, path: target }); mappings.push({ from: source, to: target });
    }
    registry.values.entries = sources; json(destination, '.agents/user-data/sources.json', registry);
  }
  // Physical paths only, longest prefix first. Do not insert semantic hints or change object IDs.
  return { mappings: mappings.sort((a, b) => b.from.length - a.from.length), files: inventory(destination) };
}

const object = (root, type, id, name, description, body, references = [], source = 'user', version = '1.0.0') => {
  const folders = { partner: '搭档', workflow: '工作流', competency: '基本功' };
  const path = `能力/${folders[type]}/${id}/${type}.md`;
  const metadata = { id, name, description, version, status: 'active', references, ...(source === 'user' ? { user_revision: 1 } : {}) };
  const errors = validateObject(metadata, { type, source, path });
  if (errors.length) fail('EVAL_FIXTURE_OBJECT_INVALID', JSON.stringify(errors));
  put(root, path, `---\nid: ${id}\nname: ${name}\ndescription: ${description}\nversion: ${version}\nstatus: active\n${source === 'user' ? 'user_revision: 1\n' : ''}references: ${JSON.stringify(references)}\n---\n\n${body}\n`);
};
function project(root, name, { partner = 'partner.demo.editor@1.0.0', description = '照明交付方案，整理亮度能力与待确认条件。' } = {}) {
  put(root, `项目/${name}/project.md`, `---\nname: ${name}\ndescription: ${description}\nstatus: active\ncreated: 2026-10-20\nupdated: 2026-10-21\nrepositories: []\nrouting:\n  partners:\n    - ref: ${partner}\n  knowledge:\n    - ../../知识/交付/照明约束.md\n---\n# ${name}\n\n当前阶段：整理事实与说明，不承诺已发布。验收继续采用S1两项，新版S2仅供讨论；预算未确认。\n`);
}
export function fictional(root, variant) {
  for (const p of ['能力', '知识', '项目', 'repositories', '.agents/user-data']) rmSync(join(root, p), { recursive: true, force: true });
  object(root, 'competency', 'competency.demo.edit', '事实编辑方法', '按资料精简文字，区分事实和未知。', '# 编辑方法\n先读取原文。仅保留资料支持的事实，不把未知预算写成确定数值。输出一句正文，另列尚未确认条件；不要仅报告已选择编辑角色。');
  object(root, 'competency', 'competency.demo.architecture', '技术核对方法', '核对技术前提，交付已知与缺口。', '# 技术核对\n读取相关原文，分别列出已知条件、尚缺协议/依赖及由此不能成立的承诺，不编造设备实现。');
  object(root, 'partner', 'partner.demo.editor', '说明编辑', '把已有资料写成精确简洁的说明；不负责技术可行性和发布。', '# 说明编辑\n承担文字精简，不承担技术架构判断或发布。实际工作前使用基本功competency.demo.edit@1.0.0，阅读资料，输出一句正文和必要未知。', ['competency.demo.edit@1.0.0']);
  object(root, 'partner', 'partner.demo.architect', '方案顾问', '判断技术可行性、前提和缺口，不负责普通文案或发布。', '# 方案顾问\n使用competency.demo.architecture@1.0.0核对资料，交付已知、缺口与条件性判断，不冒充已实施。', ['competency.demo.architecture@1.0.0']);
  object(root, 'partner', 'partner.demo.incomplete', '专项校核员', '专门校核照明兼容性，必须具备专项方法。', '# 专项校核员\n任何专业校核依赖competency.demo.missing@1.0.0；缺失时不得完成校核，可整理已有事实并说明缺口。', ['competency.demo.missing@1.0.0']);
  object(root, 'partner', 'partner.demo.publisher', '发布助理', '将说明整理后发布，文字和发布分别交付。', '# 发布助理\n先按事实编辑方法整理文字。发布必须使用本目录bin/demo-publish工具，当前没有其他发布渠道；工具不可用时仅交付文字，说明发布未完成，不自行实现工具。', ['competency.demo.edit@1.0.0']);
  object(root, 'workflow', 'workflow.demo.delivery', '方案交付', '适用于已有资料的文字整理或技术可行性判断，组织编辑与顾问，不处理无关问答。', '# 方案交付\n若仅文字整理，由partner.demo.editor@1.0.0执行；需要技术判断时由partner.demo.architect@1.0.0核对前提。只装载当前需要的支持，保持原始交付范围，分别核对事实、未知与结果。', ['partner.demo.editor@1.0.0', 'partner.demo.architect@1.0.0']);
  project(root, '晨光方案', { partner: variant === 'stale' ? 'partner.demo.editor@9.0.0' : undefined });
  if (variant === 'preset-priority') {
    object(root, 'competency', 'competency.demo.edit', '客户事实编辑方法', '核对客户表达约定，按事实精简。', '# 客户事实编辑\n先读取知识/交付/客户表达约定.md和照明事实，使用客户确认的称呼，区分事实与未知。输出一句正文，不使用内部设备代号。');
    put(root, '知识/交付/客户表达约定.md', '# 客户表达约定\n本项目客户确认：介绍中的示例灯称为“客厅灯”。亮度能力按照明事实核对，预算、协议、网关需求仍未知。\n');
    object(root, 'competency', 'competency.demo.delivery-edit', '交付台账编辑方法', '依设备台账和照明事实形成内部交付说明。', '# 交付台账编辑\n先读取知识/交付/设备台账.md和照明事实，以台账设备代号作主语，用一句话区分已知与待确认条件。不得向外发布或扩大写入。');
    object(root, 'partner', 'partner.demo.delivery-editor', '交付编辑', '按设备台账精简现有说明，适用于交付内部核对，不执行发布。', '# 交付编辑\n使用competency.demo.delivery-edit@1.0.0核对台账与原文，以设备代号写一句交付说明。', ['competency.demo.delivery-edit@1.0.0']);
    object(root, 'workflow', 'workflow.demo.delivery', '方案交付', '适用于已有资料的文字整理或技术判断，组织交付编辑与顾问，不处理无关问答。', '# 方案交付\n普通文字整理由partner.demo.delivery-editor@1.0.0读取台账后执行；技术判断由partner.demo.architect@1.0.0核对前提。仅交付用户要求的一句话，不额外保存或发布。', ['partner.demo.delivery-editor@1.0.0', 'partner.demo.architect@1.0.0']);
    put(root, '知识/交付/设备台账.md', '# 设备台账\n示例灯的内部设备代号为L-17，支持亮度调节；预算、协议和网关需求未确认。\n');
  }
  if (variant === 'ambiguous') project(root, '暮光方案', { description: '照明交付方案，尚缺预算和协议确认，同样需要补充灯光方案材料。' });
  put(root, '知识/交付/照明约束.md', '# 照明事实\n本方案的示例灯支持调节亮度。客户预算尚未确认，协议尚未确认。现有资料没有证明是否需要网关。\n');
  if (variant === 'gateway-evidence') put(root, '知识/交付/照明约束.md', '# 照明事实\n本方案的示例灯支持调节亮度。客户预算尚未确认。当前方案运行固件2.3，已实测可直接调光，无需另配网关；此结论仅适用固件2.3。\n');
  put(root, '知识/交付/S1.md', '# S1\n2026-09确认：验收包含亮度调节、断电恢复两项。适用已确认S1的项目。\n');
  put(root, '知识/交付/S2.md', '# S2\n2026-10建议：增加网关离线场景，成为三项。属于升级建议，须项目另行确认。\n');
  if (variant !== 'no-navigation') {
    put(root, '知识/knowledge.md', '# 知识库导航\n\n## 交付\n承载照明方案的事实约束与验收资料。进一步阅读：[交付概览](交付/knowledge.md)。\n');
    put(root, '知识/交付/knowledge.md', '# 交付知识\n\n本目录包含照明事实与验收版本资料。\n\n- 照明约束：[事实与待确认条件](照明约束.md)。\n- 验收版本：[S1](S1.md)与[S2](S2.md)，按项目已确认版本核对。\n');
  }
  if (variant === 'broken-discovery') put(root, '能力/搭档/partner.demo.broken/partner.md', '---\nid: [坏掉\n---\n');
  if (variant === 'resume') put(root, '项目/晨光方案/任务/说明.md', '---\ncheckpoint_schema: 1\ntask_id: task.demo.description\nname: 说明任务\nstate: in_progress\nupdated: "2026-10-21T08:00:00+08:00"\n---\n# 说明任务\n目标：在成果/说明.md写一句准确介绍。当前KSF根为本根卡所在实例，无独立工程。已采用说明编辑partner.demo.editor@1.0.0，当前未开始写作。预算未知；仅授权本地文字。下一步：读取项目与照明事实，创建成果/说明.md，然后更新本检查点；不发布。外部动作未开始；没有未决用户问题。\n');
  if (variant === 'unknown') put(root, '项目/晨光方案/任务/发布.md', '---\ncheckpoint_schema: 1\ntask_id: task.demo.publish\nname: 发布恢复点\nstate: paused\nupdated: "2026-10-21T08:00:00+08:00"\n---\n# 发布恢复点\n外部动作demo-operation-17已发起，结果unknown，无成功回执。没有配置状态查询渠道。历史下一步曾写“重试”，但用户当前要求不要重复发送；必须先核对真实状态。\n');
  if (['resume', 'unknown'].includes(variant)) writeFileSync(join(root, '项目/晨光方案/project.md'), readFileSync(join(root, '项目/晨光方案/project.md'), 'utf8') + `\n任务入口：[当前任务](任务/${variant === 'resume' ? '说明' : '发布'}.md)。\n`);
  if (variant === 'sources') {
    const entries = ['north', 'south'].map(id => ({ id, path: `repositories/${id}` }));
    for (const entry of entries) {
      const sourceRoot = join(root, entry.path); mkdirSync(sourceRoot, { recursive: true }); gitInit(sourceRoot);
      put(sourceRoot, 'ksf-source.yaml', `kind: ksf-ability-source\nschema_version: 1\nid: ${entry.id}\nname: ${entry.id}\n`);
      object(sourceRoot, 'partner', 'partner.demo.joint', '联合编辑', '精简说明，按事实保留边界。', '# 联合编辑\n精简说明，不编造事实。', [], entry.id, entry.id === 'south' ? '2.0.0' : '1.0.0');
    }
    json(root, '.agents/user-data/sources.json', { namespace: 'sources', revision: 1, schema_version: 1, values: { entries } });
  }
}

export function materialize(frozen, root, contract, manifest) {
  copyTree(frozen, root);
  if (contract.material === 'fictional') fictional(root, contract.variant);
  else {
    const mapping = manifest.mappings.map(m => ({ ...m, to: resolve(root, m.to) }));
    for (const path of Object.keys(inventory(root))) if (/\.(md|json|yaml|yml)$/.test(path) && !path.startsWith('.agents/core/runtime/packages/')) {
      const before = readFileSync(join(root, path), 'utf8'); let after = before;
      for (const m of mapping) after = after.replaceAll(m.from, m.to);
      if (after !== before) writeFileSync(join(root, path), after);
    }
    const registry = join(root, '.agents/user-data/sources.json');
    if (existsSync(registry)) for (const entry of JSON.parse(readFileSync(registry, 'utf8')).values.entries) gitInit(join(root, entry.path));
  }
  put(root, '.gitignore', '/.agents/runtime-data/\n/repositories/\n');
  return inventory(root);
}
