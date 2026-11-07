# 项目治理文件协议与接口

项目治理使用[文档架构](document-architecture.md)组织方案、计划、执行和复盘。[正式模板](templates/README.md)可直接裁剪；阶段式引导由项目推进搭档及四个基本功负责。本文解释程序字段、读写、校验及兼容契约；定义由[能力原件](../../abilities/partners/project-manager/references/governance.md)、[程序模型](../../runtime/src/projects/governance/model.js)及[状态模型](../../runtime/src/projects/governance/states.js)持有，文档不参与业务定义或运行，不能用结构通过代替专业判断或真实用户验收。

## 格式与原件

根卡有 `governance_schema: 2` 时采用统一状态格式；schema1治理记录可读且只读保留，显式迁移后编辑；没有该字段时沿用旧JSON项目。未知版本或损坏保留原件并返回诊断，不回退读取旧JSON。项目文件是普通材料，不是第五类能力对象。

| 字段 | 共同语义 |
| --- | --- |
| governance_schema、kind | 当前格式2；kind为project、milestone、task、review |
| id、name | 稳定身份与可读名称；id最长128字符，字母/数字开头，可含._:-；改名不换id |
| status、owner | 本对象记录状态；负责人为文本或null，active/review任务需明确负责人 |
| updated | 实际ISO保存时间，由公共提交程序写入 |
| next_action | 本层唯一下一步，具体文本或null；正文不重复维护 |
| guidance | 按需保存{method,step,pending_questions}，表示未完成的阶段引导，不保存完整聊天或隐藏推理 |

项目、里程碑、任务统一使用planned（未开始）、active（进行中）、paused（已暂停）、review（待验收）、completed（已完成）、cancelled（已取消）。blocker表示受阻，不改变主状态；可开始按负责人、条件、承诺、层级、依赖和容量计算。复盘记录仍为draft/completed，验收结论为pending/passed/failed/cancelled。状态定义与流转以程序states.js为准。

| 类型 | 专有内容 |
| --- | --- |
| project | level:A/B/C/D；mode:finite/ongoing；phase:definition/planning/execution/review；parent_project、child_projects、milestones、focus_milestones、wip_limit、goals、criteria、review_ref、risks、decisions |
| milestone | project、goal_ids、tasks、focus_tasks、depends_on、criteria、review_ref |
| task | project、milestone、goal_ids、work_type:delivery/acceptance、commitment:candidate/next/now、priority:high/normal/low、depends_on、criteria、blocker、resume_condition、context_refs、result_refs、verification |
| review | subject、outcome、basis_digest、criterion_results |

关联使用 `{id,path}`，path相对KSF根；项目目录物理平铺，逻辑父子可以继续嵌套。milestones、tasks等为显式索引。程序检查ID、路径、类型、双向归属、自指及循环；无索引文件不自动认定为正式任务。新项目默认在制上限1，迁移保留旧上限。

goals保留稳定id、title及可选successCriteria，goal_ids引用所属项目目标。criteria为`[{id,text}]`，记录完成条件定义。当前管理阶段表示本层管理重点，允许前一里程碑执行与后续规划同时存在。

## 验收、阻塞与上下文

任务验收保存在verification：`{basis_digest,results}`；里程碑/项目验收保存在复盘原件的basis_digest与criterion_results。结果项为`{criterion_id,result,evidence,reviewer,reviewed_at}`，通过条件需要实际复核者、ISO时间与证据。basis_digest是对criteria按键排序后JSON内容计算的SHA256。

本地证据使用`{path,digest}`，digest为原件SHA256；网页使用`{url,version}`，注明所核对的版本或时间，程序不自动联网验证内容。证据与上下文可以引用项目外的工作区原件，但拒绝越界路径、符号链接及实例私有运行/用户数据。正式治理原件及公共写入只位于项目或项目档案下；单文件最大2MB。

completed任务要求每项条件通过。completed里程碑/项目还要求复盘completed且outcome=passed、下级必需工作已结束。复盘完成可得出failed或cancelled；任务/子项目全部结束不自动完成父级。ongoing项目不会因最后一个现有里程碑结束而自动结项。

证据或条件变化时，读取保留记录并标识需复核，阻止依赖该结果的新启动；不重写历史评审。新写入的完成声明必须使用当前有效依据。结构检查不判断证据语义或业务目标是否真实实现。

blocker非空的未结束对象需要解阻负责人（owner）、下一步和恢复条件；暂停保存status_reason、resume_status和恢复条件，取消或重开说明原因。active/review任务计入在制，受阻不自动释放容量。未开始任务的可开始由当前事实计算；直接进入active/review也要检查准入。父级review仅允许work_type=acceptance的试用验收和补证；实质交付需将父级恢复active。里程碑的必要前置同时约束其任务的新启动；父子项目归属不是硬依赖。依赖可显式跨项目引用任务或里程碑，循环检查包含里程碑收口所需任务，取消前置不能冒充完成前置。

context_refs 和 result_refs 使用 path 或 url 及可选 role，分别指向当前需要的输入与有效结果。用户主动要求留存上下文时，Agent 才创建相应的编号条目。项目根目录用 P00、P10 等编号，里程碑目录用 M00、M01 等编号，任务目录用 00、10、20 等编号。治理 read 的 contextEntries 返回入口，context-list 接收 {path} 并列出编号包的一层。跨层引用原件，验收指向具体文件。

项目、里程碑和任务在各自主文的同级目录保存灵感闪现.md。公共建档同次生成手记，内容由用户自由记录，保存时使用该手记的文件摘要核对并发修改。

## CLI和公共服务

```sh
.agents/ksf project governance read 示例 --json
.agents/ksf project governance check 示例 --json
.agents/ksf project governance apply 示例 --from candidate.json --dry-run --json
.agents/ksf project governance apply 示例 --from candidate.json --json
.agents/ksf project governance migrate 示例 --dry-run --json
.agents/ksf project governance reorganize 示例 --from reorganization.json --dry-run --json
.agents/ksf project governance recover operation-id --dry-run --json
```

read/check不写文件。read返回format、project、documents、etag、诊断、stale及可做集合；各原件返回metadata、body和文件etag。format为missing/legacy/documents。部分错误保留可读原件，调用方必须核对valid和诊断，不能把可读当成有效。

apply输入：

```json
{
  "operationId": "unique-operation-id",
  "ifMatch": "read返回的项目etag",
  "changes": [
    {
      "path": "项目/示例/M1-阶段结果/A1-具体工作/task.md",
      "ifMatch": "该原件etag；新文件用missing",
      "metadata": {"next_action": "核对本次结果"}
    }
  ]
}
```

metadata合并顶层字段，body提供时替换完整正文；无关元数据、正文和已有YAML注释尽量保留。文件总数最多128，编号上下文和灵感闪现可用contentBase64保存原字节，手记不解释为YAML元数据；不能借此覆盖根卡、旧JSON或任意业务文件。业务保存统一使用治理apply；project write仍可维护能力预设、工程关联、主题和摘要。

可选setParent为`{child:{id,path},parent:{id,path}|null}`，与changes同次提交，程序同步移除旧父关系并维护新父子两端。操作持有项目锁，核对整体与逐文件基线，保存恢复日志后逐文件发布，根卡最后发布。中断留下待恢复状态，读取不会把混合结果当作正常结果；不声称操作系统支持跨文件原子替换。

同操作ID与同请求可对账；内容不同、原件后续变化或并发冲突均不覆盖。recover先核对本次前后摘要，条件满足才回退本次差异；有后续修改时保留现场。正常完成的操作也可在原件未再变化时按明确回退要求恢复。

应用通过公共projects服务的governanceRead、governanceCheck、governanceApply、governanceMigrate、governanceRecover调用同一实现。应用只保留显示偏好与窗口草稿，原文修改同样经过版本核对、重叠修改选择和公共提交。

## 迁移与归档

使用工作台项目应用的实例，迁移前必须核对**实际激活的应用包**支持Markdown治理，且当前后台提供配套公共服务。候选已构建、源码已修改或隔离样例通过，不能代替已启用；已有窗口仍固定旧包时，先经关闭保护保存草稿，再切换并重新打开。只使用CLI的实例按其实际入口验收。

项目切换后，从真实工作台打开刚迁移的项目，检查总览、里程碑与任务、复盘及灵感入口，并核对未迁移项目仍可读取。将实际包版本、摘要和打开结果随迁移证据保存。若旧应用收到PROJECT_MODEL_MIGRATED，应启用配套应用，不回退读取冻结JSON。项目已切换后不能只把应用退回不支持该格式的旧版；项目资料位于工作区，不属于应用私有dataStores，应用数据schema兼容检查不能证明项目格式兼容。

migrate默认只生成inventory、changes、approvalDigest和待审问题。执行时提交已审阅mapping、approvalDigest与operationId；来源或清单变化会拒绝旧摘要。新项目正文、规模、阶段条件和当前重点可在mapping中明确。有限/持续类型属于业务安排，不能从目录数量推断。

旧完成/取消事项留在历史导航；旧未结束事项为迁移候选，当前承诺和暂停分别保留。缺负责人、阶段条件或历史前置核对的事项不会伪装ready。历史前置保存在legacy_dependencies:{id,source,digest,verification}，未核对时阻止启动；用户可以在新计划中明确替代依赖。

迁移保留旧JSON与检查点，根卡原字节、源摘要和映射保存在迁移任务编号上下文。migration.aliases保存旧检查点到新任务的映射；唯一时接续，多义时澄清。没有新建复盘记录就不会补造新标准下的验收通过。旧management接口对已迁移项目返回PROJECT_MODEL_MIGRATED，旧JSON停止更新。

归档/恢复沿现有project archive/restore入口，治理项目使用同次过渡的结构化引用重定位、目录移动和恢复日志。保留业务状态，不递归归档子项目；工程留原位。预览列出所有受影响治理原件，历史正文和Markdown/Wikilinks仍需按实际入口复核。归档业务写入只读，引用重定位属于显式过渡维护。中断可使用project governance recover或project recover按实际操作ID核对回退。

### 保留项目身份并重组现行安排

已经采用Markdown治理的持续项目，可以在明确授权下用reorganize封存旧阶段并建立新的子项目计划。输入为`{operationId,ifMatch,snapshotPath,newProjects,changes,referenceChanges}`；changes沿用apply格式，newProjects为本次新建的直接子项目目录名。snapshotPath固定为`档案/项目历史资料/<项目目录名>/<批次>`，目标须不存在。总项目稳定ID和路径不变，新的里程碑使用新路径。

该历史目录是普通资料快照，不登记为另一份项目，不重复激活旧ID。旧根卡复制原字节，其余旧材料在同一文件系统内逐项移动；包括大文件、依赖快照和不跟随的符号链接。程序保存逐文件SHA256清单，核对封存前后摘要。工程、聊天和其他项目原件不随之移动。历史正文保留当时写法；现行导航通过原路径到历史路径的清单访问。

referenceChanges可选，每项为`{path,ifMatch,contentBase64}`，仅用于明确列出的现行Markdown导航，支持README、档案/archive.md及知识/能力/其他项目中的文档；调用方负责仅改已核对的引用并保留原文依据。聊天、个人运行数据和工程不在范围内。重组使用同一项目锁及待恢复标识，发布中断后禁止正常读取混合结果；recover预览核对旧资料与当前原件，后续修改或新增内容会阻止回退。完整快照需要扫描全部旧材料，预演和执行应给足时间。

## 错误与验证边界

错误使用PROJECT_GOVERNANCE_INPUT/INVALID/RELATION、CONFLICT、OPERATION_CONFLICT、NOT_READY、PATH、SIZE、ARCHIVED、PENDING、RECOVERY等代码，保留路径/字段或逐项issues。全量关联校验、程序回归、界面操作、当前Agent对话走查与真实用户效果分别记录。跨平台与长期效果只按实际证据声明。

## 统一状态格式升级

schema1治理记录沿migrate生成只读预演，mapping使用evidence_task_id及objects逐ID映射。backlog/ready合并planned，in_progress合并active；blocked必须明确原推进环节，保留障碍，paused须明确暂停前状态及原因。预演给出approvalDigest、源摘要和变更，审阅后提交operationId及approvalDigest。原字节备份和映射随指定任务保存；多文件锁、冲突、中断恢复沿同一apply实现。只读及预演不迁移，归档历史不升级。

## 项目归档与恢复的解释

本节解释能力包与公共程序已经定义的行为。实际过程见验收基本功的[归档与恢复阶段引导](../../abilities/competencies/project-acceptance/references/archive.md)，状态及条件提交见[runtime归档事务](../../runtime/src/projects/governance/lifecycle.js)，旧入口定位见[位置解析](../../runtime/src/projects/governance/locations.js)。

schema2项目保留六主状态；归档范围由位置派生，允许完成、取消或暂停后封存。项目整体搬至档案/项目，父子按显式清单维护，不自动递归；恢复只改变位置，不自动重开工作。归档记录留在archive_history，原字节与事务证据在公共操作日志中。正文及原始聊天保持，旧入口经project locate查阅。当前会话及祖先归档后只能查阅，先恢复并重新核对事实再执行。

Agent和应用均先预览project archive/restore，再提交同一targets、reason、actor，并携带operationId及预览ifMatch。旧格式沿原机制，本节不改变历史记录或自动迁移。

## 新任务自动编号说明

业务方法见项目推进搭档能力包的公共自动取号与建档定义，字段和安全约束由runtime/src/projects/governance/create-task.js及store.js持有，本文只解释调用。

CLI入口为project governance create-task，公共服务为projects.governanceCreateTask。传入operationId、milestone的id/path、已定义stage、name及必要任务业务字段；先dry-run，再携返回的ifMatch提交。预览不写文件、不占号，最终编号以提交回执为准。程序在项目锁内取下一个号、创建task.md并维护milestone.tasks与task_counters，取消编号不复用；同一创建重试沿用operationId。此入口只支持新版字母阶段，不兼容旧任务结构，不自动迁移。
