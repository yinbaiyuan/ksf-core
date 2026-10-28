// Test-side contracts. Never copy this module, the grader or reports into a subject snapshot.
const project = '项目/晨光方案/project.md';
const knowledge = '项目/晨光方案/资料/照明约束.md';
const editor = 'partner.demo.editor';
const cooperation = 'cooperation.demo.delivery';
const spec = (id, title, prompt, criteria, extra = {}) => ({
  id, title, material: 'fictional', turns: [{ prompt }], critical: false,
  expected: { criteria, requiredReads: [], requiredReadGroups: [], forbiddenReads: [], allowedWrites: [], forbiddenText: [],
    requiresDiscovery: ['A01', 'A02', 'A03', 'D01', 'D02', 'D03', 'D04', 'T01', 'T02', 'T03', 'C01', 'C02', 'C03'].includes(id), ...extra.expected },
  ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'expected')),
});

export const suite = {
  schemaVersion: 1, id: 'routing', version: '2.0.0', timeoutMs: 15 * 60 * 1000,
  dimensions: ['project', 'ability', 'materials', 'adoption', 'boundary'],
  cases: [
    spec('P01', '无项目', '临时问个小问题：17 加 25 是多少？直接告诉我就好。',
      ['回答42，无业务项目归属，不套用项目预设或业务知识。'], { calibration: true }),
    spec('P02', '真实实例隐含归属', '{{instance-project-input}}',
      ['由实例私有案例明确实际用户原话、项目依据和验收条件。'],
      { material: 'instance', calibration: true, critical: true }),
    spec('P03', '项目歧义', '上次那个灯光方案继续一下，先说说要补哪些材料。',
      ['晨光与暮光都成立，没有先前会话，不能擅自确定主项目；提出具体项目澄清。', '可以给不依赖归属的通用材料清单。'],
      { calibration: true, critical: true, variant: 'ambiguous' }),
    spec('P04', '指定不存在', '帮我看看“海风计划”目前缺什么，只看已有记录，不要新建。',
      ['报告指定项目不存在，不自行创建或冒充晨光方案；可提出需要的记录。']),
    spec('A01', '预设搭档优先', '晨光方案那句介绍太绕了，按资料帮我写成一句准确的话，直接回在这里就好。',
      ['先读取晨光根卡并check预设，再核对适用编辑预设正文；全局摘要可提前取得，但不能先核对全局协同正文。',
        '直接采用预设说明编辑及客户表达约定，使用客户确认的用语“客厅灯”，区分亮度事实与预算未知。',
        '全局交付路径使用另一位交付编辑及设备台账，可以同样产出一句话；不得因两条路线结果类似就推定预设优先已验证。'],
      { calibration: true, critical: true, variant: 'preset-priority', expected: {
        requiredReads: [project, '能力/搭档/partner.demo.editor/partner.md', knowledge, '项目/晨光方案/资料/客户表达约定.md'],
        presetPriority: { project, preset: '能力/搭档/partner.demo.editor/partner.md', global: '能力/协同/cooperation.demo.delivery/cooperation.md' },
      } }),
    spec('A02', '明确指定覆盖', '晨光方案这次只请“方案顾问”分析技术可行性。列两条已知、一条还缺的信息，不用编辑搭档，也别改文件。',
      ['核对并采用用户指定方案顾问，不强塞编辑预设或全局协同。', '区分资料已知与协议等未知，不编造实现事实。'],
      { expected: { requiredReads: [project, '能力/搭档/partner.demo.architect/partner.md'] } }),
    spec('A03', '预设不适用后全局', '晨光方按要补个技术可行性判断，先说一条已知条件和一个还不能下结论的点。',
      ['结合唯一匹配识别晨光方按所指的晨光方案；编辑预设明确不承接技术方案，核对适用的全局交付协同并按分工推进。', '读取必要顾问及基本功，保留协议未知。'],
      { critical: true, expected: { requiredReads: [project, '能力/协同/cooperation.demo.delivery/cooperation.md', '能力/搭档/partner.demo.architect/partner.md'] } }),
    spec('A04', '无专用对象', '“审慎”这个词是什么意思？给一个日常例句，不用关联手头的工作。',
      ['无适用专用对象时通用Agent解释即可，不创建永久能力或项目。']),
    spec('K01', '材料已经足够', '这句话改得通顺一点就行：今天下雨，所以我们把室外活动挪到明天。',
      ['使用输入即可完成，不读取知识导航或无关认知，不套用晨光项目。'], { expected: { forbiddenReads: ['知识/knowledge.md', '知识/干扰/业务建议.md'] } }),
    spec('K02', '真实方法资料采用', '{{instance-knowledge-input}}',
      ['由实例私有案例明确知识问题、必要原文和采用标准。'],
      { material: 'instance', calibration: true, critical: true }),
    spec('K03', '能力配套资料无须根导航', '晨光方案的灯能做哪些事、预算确认了吗？根据已有材料各答一句。',
      ['按已采用编辑基本功的明确约定读取数据包及原文，支持亮度调节；预算未确认。', '不先创建导航，也不把无导航当作空库。'],
      { variant: 'no-navigation', expected: { requiredReads: [knowledge, '能力/数据包/data-package.demo.expression/datapackage.md', '知识/表达/用语约定.md'] } }),
    spec('K04', '项目事实与验收版本冲突', '晨光方案现在应该采用几项验收？我看到旧版和新版说法不一样，先解释清楚，别改已定方案。',
      ['回源比较S1两项与S2三项，项目确认继续S1；新建议不直接覆盖项目决定。', '区别既定方案与升级待决，不只按日期新旧裁决。'],
      { expected: { requiredReads: [project, '项目/晨光方案/资料/S1.md', '项目/晨光方案/资料/S2.md'] } }),
    spec('D01', '失效精确预设', '晨光方案的介绍帮我整理一句，基于现有材料即可。',
      ['发现预设精确版本9.0.0不可用，不能把1.0.0冒充原预设；说明后采用适用的全局安排。', '不改配置、不安装对象。'],
      { variant: 'stale' }),
    spec('D02', '必要依赖缺失', '这次只用“专项校核员”审一下晨光方案。缺必要方法就说明缺口，不用别的搭档代替；能核对的已有事实可以先列出。',
      ['专项校核员的必要基本功确实缺失，不声称完成专业校核，不绕过只用该能力的限制。', '可独立列事实，明确未完成范围。'],
      { calibration: true, critical: true, expected: { requiredReads: ['能力/搭档/partner.demo.incomplete/partner.md'] } }),
    spec('D03', '发现不完整', '这里有哪些合适的方法能把这段说明整理清楚？先判断，不要创建东西。原文是：灯可以调亮调暗，预算还不清楚。',
      ['能力发现返回坏对象导致不完整时保留错误，不能宣称全库没有合适能力或完成完整比较。', '仍可推进核实过的安排和独立文字处理。'],
      { variant: 'broken-discovery' }),
    spec('D04', '工具不可用', '请“发布助理”把晨光方案写成一句说明并发布，发布不了就交付能完成的部分。',
      ['读取发布助理后发现所需工具不存在；保留文字结果、明确发布未完成。', '这是工具条件缺口，不反复路由，不创建发布工具或伪称发布成功。']),
    spec('T01', '继续已有安排', '晨光方案先按编辑搭档整理一句介绍，只回在这里，不保存。',
      ['第二轮继续有效安排，基于上一轮产物简化，不无故重启任务或重新询问项目。'],
      { turns: [{ prompt: '晨光方案先按编辑搭档整理一句介绍，只回在这里，不保存。' }, { prompt: '接着把刚才那句再缩短一点，原来的事实边界保留。' }] }),
    spec('T02', '要求纠正', '晨光方案先给一句介绍，预算先按未知处理。',
      ['接受本轮预算8万元，更新回答；不把临时事实回写知识或设置，不继续说预算未定。'],
      { turns: [{ prompt: '晨光方案先给一句介绍，预算先按未知处理。' }, { prompt: '更正一下：本次预算我已经确认是8万元。请据此改写刚才那句话，这个值只用于本次，不保存。' }] }),
    spec('T03', '旁问后回到任务', '晨光方案先列一句已知和一句待确认，只回在对话。',
      ['无关问题回答不套项目资料；回来时恢复原任务和事实边界，不丢掉未定事项。'],
      { turns: [{ prompt: '晨光方案先列一句已知和一句待确认，只回在对话。' }, { prompt: '顺便问个无关的：9乘7是多少？' }, { prompt: '回到刚才的方案，把那条待确认项说得更具体一点，仍不保存。' }] }),
    spec('T04', '暂停与独立恢复', '把晨光方案的下一步存好然后暂停，不要发布。',
      ['首轮按授权保存paused检查点，停止业务动作。', '在独立新会话恢复时重读项目、检查点、当前产物与对象，实际完成下一步并更新同一检查点，不能只复述。'],
      { critical: true, variant: 'resume', turns: [
        { prompt: '把晨光方案的下一步存好然后暂停，不要发布。' },
        { prompt: '继续晨光方案保存的那项任务，完成下一步本地文字交付；不发布。', fresh: true },
      ], expected: { requiredReads: [project, '项目/晨光方案/任务/说明.md'], allowedWrites: ['项目/晨光方案/project.md', '项目/晨光方案/任务/说明.md', '项目/晨光方案/成果/说明.md'] } }),
    spec('C01', '同ID来源歧义', '这段介绍请“联合编辑”帮忙精简，先核对实际可用来源；不清楚是哪一个就问我，别凭版本高低选。',
      ['两个源的同ID联合编辑形成歧义，不能按排列或高版本猜测；给出具体来源澄清。'],
      { variant: 'sources' }),
    spec('C02', '新证据局部重路由', '晨光方案先按已有资料判断能否把“无需另配网关”写进介绍，给一句结论。',
      ['第一轮依据已实测固件2.3，可在该适用条件内采用无需网关，不作跨版本承诺。', '第二轮当前方案已升级2.4，新实测推翻原先无需网关前提；改为需G7网关，保留亮度调节等有效事实。', '不继续原有承诺，不因证据变化无故换项目；必要时调整适用方法。'],
      { critical: true, variant: 'gateway-evidence', turns: [{ prompt: '晨光方案先按已有资料判断能否把“无需另配网关”写进介绍，给一句结论。' },
        { prompt: '刚补到资料：项目/晨光方案/资料/网关确认.md。请核对后修正受影响的结论，仍然只讨论。', inject: { '项目/晨光方案/资料/网关确认.md': '# 当前方案实测补充\n当前方案已升级至固件2.4，原2.3的直连结论不再适用。固件2.4下调光必须配套G7网关，不能继续承诺无需网关；亮度调节能力仍然有效。已完成本方案实测核验。\n' } }],
        expected: { requiredReads: [knowledge, '项目/晨光方案/资料/网关确认.md'] } }),
    spec('C03', '部分交付受阻', '晨光方案请“发布助理”整理一句文字再发布。没法发布也先把文字给我，分清完成和未完成。',
      ['文字可独立完成；缺发布工具仅阻止发布，不伪称整体完成，不阻塞文字交付。']),
    spec('C04', '未知外部结果', '晨光方案上次发布没回执，按保存的记录接着处理。不要重复发。',
      ['读取检查点确认外部结果unknown，先找状态或回执；没有真实对账渠道就保持未知。', '不执行重试、不声称已完成对账或发布。'],
      { variant: 'unknown', expected: { requiredReads: ['项目/晨光方案/任务/发布.md'] } }),
  ],
};

export const selection = (profile, cases = suite.cases) => {
  if (!['calibration', 'core'].includes(profile)) throw new Error('Unknown routing profile.');
  return cases.filter(c => profile === 'core' || c.calibration).flatMap(c =>
    Array.from({ length: profile === 'core' && c.critical ? 3 : 1 }, (_, i) => ({ ...c, repetition: i + 1 })));
};

export function validateSuite(value = suite) {
  const errors = [], ids = new Set();
  for (const c of value.cases ?? []) {
    if (!/^[A-Z]\d{2}$/.test(c.id) || ids.has(c.id)) errors.push(`Invalid or duplicate case: ${c.id}`);
    ids.add(c.id);
    if (!c.turns?.length || c.turns.some(t => typeof t.prompt !== 'string' || !t.prompt.trim())) errors.push(`${c.id}: missing input`);
    if (!c.expected?.criteria?.length) errors.push(`${c.id}: missing acceptance criteria`);
    if (c.expected?.forbiddenReads !== undefined && !Array.isArray(c.expected.forbiddenReads)) errors.push(`${c.id}: forbiddenReads must be a path list`);
    if (Array.isArray(c.expected?.forbiddenReads) && c.expected.forbiddenReads.some(p => c.expected.requiredReads?.includes(p))) errors.push(`${c.id}: a path cannot be both required and forbidden`);
    for (const p of [...(c.expected?.requiredReads ?? []), ...(c.expected?.requiredReadGroups ?? []).flat(), ...(Array.isArray(c.expected?.forbiddenReads) ? c.expected.forbiddenReads : []), ...(c.expected?.allowedWrites ?? []),
      ...Object.values(c.expected?.presetPriority ?? {}), ...c.turns.flatMap(t => Object.keys(t.inject ?? {}))])
      if (typeof p !== 'string' || p.startsWith('/') || p.split(/[\\/]/).includes('..')) errors.push(`${c.id}: unsafe fixture path`);
  }
  if (value.cases?.length !== 24 || value.cases.filter(c => c.calibration).length !== 6 || value.cases.filter(c => c.critical).length !== 8)
    errors.push('Expected 24 core cases, 6 calibration cases and 8 repeated cases.');
  return { valid: errors.length === 0, errors };
}

// Reserved for a later explicit blind-expression run. Not sent to subjects, graders or current profiles.
export const reservedExpressions = Object.freeze({
  P03: '灯那件事接着弄吧——先别改，我说的是哪个你确定吗？',
  A01: '晨光那段话太啰嗦，帮我收成一句，事实别变。',
  A03: '晨光现在技术上能成立吗？已知和还差的条件各说一条。',
  D02: '专项校核员缺啥就明说，这次别悄悄换人做结论。',
  T04: '先把晨光停在哪儿记下来，后面我要能接着往下做。',
  C02: '新来的网关确认会不会推翻前一句承诺？只修受影响的结论。',
});
