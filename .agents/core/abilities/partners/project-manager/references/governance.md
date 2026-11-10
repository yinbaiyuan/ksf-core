# 项目治理业务定义

本资源持有能力执行所需的文件职责与维护方法。数据结构、格式版本、状态值及程序约束由[模型](../../../../runtime/src/projects/governance/model.js)、[状态定义](../../../../runtime/src/projects/governance/states.js)、[关联与可做判断](../../../../runtime/src/projects/governance/graph.js)、[条件写入](../../../../runtime/src/projects/governance/store.js)持有。正式模板在[本能力包](../templates/README.md)。core/docs仅解释上述原件，不参与业务定义、业务读取或校验。

## 文件与唯一归属

每层项目有project.md，负责方案、目标、范围、完成条件、总体路径、父子关联、里程碑索引和整体判断。项目物理平铺，通过{id,path}双向表达逻辑父子，路径相对KSF根；只列直接父子，允许继续嵌套，禁止循环。

项目根目录直接放 M编号-阶段结果/milestone.md，负责阶段目标、完成条件、任务索引、整体协调和复盘入口。每个独立任务直接放在所属里程碑的字母及任务号-工作/task.md，保留目标、当前结果、未决、上下文入口及下一步。

项目根目录用 P00、P10 等编号保存跨里程碑共用的背景和原件。里程碑目录用 M00、M01 等编号保存本阶段共用的样本和决策依据。任务目录用 00、10、20 等编号保存本项工作的输入、分析和结果。编号至少两位，条目可以是文件或文件夹。上下文包根层的 task.md 文件名留给正式任务，M10 样本包与 M10 任务可使用不同目录名。

三级编号上下文由用户主动发起。用户明确要求把某项材料作为项目、里程碑或任务上下文留存时，Agent 才在对应层级创建所需文件或目录。日常推进、测试和验收按需查阅已有材料，直接引用原件，并在各层主文维护状态、结果和下一步。产出材料本身不触发编号归档。避免自动批量建档、预建占位和重复抄录。

项目、里程碑和任务的根目录各有一份灵感闪现.md，与该层主文同级。用户可自由记录本层的问题、想法和观察。公共建档同时创建仅有标题的手记，已有手记保留原文。手记独立于编号上下文、执行安排和验收记录。

任务在 task.md 中验收，阶段复盘在本 M 目录的复盘.md，项目复盘在项目根目录的项目复盘.md。持续项目按里程碑迭代。

## 统一状态与动作

三层主状态均为：planned未开始、active进行中、paused已暂停、review待验收、completed已完成、cancelled已取消。active包括方案/计划工作。普通路径planned→active→review→completed；验收返工回active。小任务可同次保存合格完成结果，不为经过状态反复写文件。

暂停保留status_reason、resume_status和resume_condition；恢复先核对新事实，回到原环节，再决定后续。取消记录status_reason，保留已取得成果。重开已结束对象说明原因，保留原验收，不自动重复执行旧外部动作。

受阻保存在blocker；同时明确owner、next_action和resume_condition，不修改主状态。普通排队等待前置仅解释不可开始原因，不全部标受阻。受阻任务继续占用在制；planned/paused/completed/cancelled不占用。任务work_type=delivery为交付，acceptance为试用、验收和补证。父级review允许acceptance推进，实质交付返工先将受影响父级恢复active。

可开始为派生判断：任务planned、已纳入承诺、负责人及下一步明确、输入和条件具备、阻塞解除、必要前置有效完成、所属层级允许当前用途且容量足够。未结束任务的commitment区分candidate/next/now，不以状态冒充授权。next_action是本层唯一下一步字段，正文不重复维护。

## 验收与上层判断

任务verification使用{basis_digest,results}；里程碑/项目复盘使用basis_digest、criterion_results和outcome。basis_digest按程序criteriaDigest计算，结果关联稳定criterion_id并保存result、evidence、reviewer、reviewed_at。程序校验摘要及来源，Agent另核对证据是否实际支撑业务结论。

本地证据为{path,digest}，网页为{url,version}。passed须逐条件有真实证据、复核者和实际时间。研究负面结论可以符合原研究条件。复盘status仅draft/completed；outcome为pending/passed/failed/cancelled，复盘完成不代表通过。

任务完成不自动完成里程碑，子项目完成不自动完成父项目。上层完成仍检查本层条件、有效验收及必需下级结束。证据或条件变化先标需复核，阻止依赖该结果的新启动，保留原历史评审；确认返工才重开受影响工作。

## 公共保存与迁移

业务读取/预演/保存使用本实例启动器：

```sh
.agents/ksf project governance read 项目目录名 --json
.agents/ksf project governance check 项目目录名 --from candidate.json --json
.agents/ksf project governance apply 项目目录名 --from candidate.json --dry-run --json
.agents/ksf project governance apply 项目目录名 --from candidate.json --json
```

apply 输入 {operationId,ifMatch,changes:[{path,ifMatch,metadata?,body?,contentBase64?}]}，新文件 ifMatch=missing。只改有实际变化的对象，先预演后提交再读回。编号上下文及人工手记可用 contentBase64 保留原字节。父子变更用 setParent 同步两端。操作 ID 用于对账，整体和逐文件摘要防止覆盖并发修改。冲突保留双方草稿，多文件中断先按 recoveryId 预演 recover。字段合并及允许路径以程序为准。

read 的 contextEntries 按层列出编号入口，文件夹用 project governance context-list <项目名> --data '{"path":"…"}' 按需查看一层。Agent 接续先读所属主文，再选择和当前问题相关的编号材料。

schema2采用统一状态；schema1治理记录只读保留，旧JSON项目继续原服务，不因读取自动迁移。治理格式升级沿migrate预演，mapping={evidence_task_id,objects:{稳定ID:{status?,work_type?,resume_status?,status_reason?,next_action?}}}。原blocked不能推断旧环节，须明确映射；旧paused须明确原状态和原因。核对approvalDigest后以operationId执行，备份原字节及清单随指定任务保存。历史原件不改写。未知版本报错，不回退旧JSON。

归档/恢复是明确过渡操作，不是主状态；先预演、核对引用及原件，再执行并读回。整个项目封存或重组依有效授权办理，工程和原始聊天不随意移动。接口不授予Git、发布、外发或自动调度权限。

## 项目级归档与恢复

归档是独立于六主状态的封存行为，范围由项目位置和公共接口返回，不另加archived布尔值。已完成/已取消/已暂停分别按[验收基本功的归档过程](../../../competencies/project-acceptance/references/archive.md)办理；完整程序契约由[lifecycle.js](../../../../runtime/src/projects/governance/lifecycle.js)与[位置解析](../../../../runtime/src/projects/governance/locations.js)持有。归档及恢复使用project archive/restore，先dry-run，再提交含targets、reason、actor、operationId和ifMatch的请求；恢复不带status。旧入口通过project locate核对，不能重写历史正文或替换旧验收摘要。

## 里程碑内部的任务推进阶段

milestone.md的task_stages保存{code,name,purpose,exit_criteria}：唯一A—Z字母、用户定义名称、解决的问题、进入下一阶段的判断。它是里程碑内部的轻量分组，不是新的管理层级，也没有独立状态或专用目录。任务索引仍仅维护tasks一份，任务的task_code为A1、B2、Z1等；目录编号必须一致，稳定id不随编号变化。

默认A为计划与准备，细化当前里程碑目标及必要输入，不重复project.md总体方案；B—Y按真实推进路径由用户定义；Z为最终验收与复盘。只定义实际需要的阶段，明确工作可直接从B开始，不预建26组或空任务。同组任务可以并行或有真实依赖，数字区分任务，不规定执行先后。进入下一阶段依用户判断、阶段结果和真实依赖，不从字母自动建立硬依赖或更改状态。

新增任务由基本功引导确定阶段后，统一调用公共create-task；程序在项目锁内读取已用最大号并追加，包括取消项，不由Agent手填编号、目录或tasks索引。编号计数task_counters由程序维护，不重排旧任务，不复用已取消编号。进入C后仍可补B4；新一轮工作可新增D。灵感保持人工手记，明确执行意图后才选阶段建任务。

Z可在规划时定义，实际启动前核对当前承诺范围的交付和验收输入；不要求先验收通过，也不因所有候选未结束而禁止启动。返工交回相关阶段，核对本层状态后再继续同一Z任务。简单里程碑用Z1承接验收与复盘；复杂时可分Z1验收、Z2复盘。Z任务只记录推进过程、证据入口和未决，本层最终结论仍唯一保存在里程碑复盘.md。

使用里程碑/或任务/中转目录的存量项目由用户手动提级，并核对索引、依赖、证据和工作接续入口。新目录下已有任务改号调用 project governance renumber，输入 {operationId,ifMatch,actor,reason,milestones:[{id,task_stages,tasks:[{id,code}]}]}，列出所选里程碑所有任务。先 dry-run，再携返回的 ifMatch 提交。事务保留稳定 ID、业务状态、验收条件和原正文，同步结构化引用并原样移动任务上下文。由该事务记录的旧链接经 project locate 或 projects.resolve 解析。中断通过 governance recover 有条件回退。阶段定义、状态和程序验证由能力与程序模型持有。

## 公共自动取号与建档

新版字母阶段任务使用project governance create-task。公共服务为projects.governanceCreateTask，复用同一创建实现。请求包含{operationId,milestone:{id,path},stage,name,ifMatch?,owner?,next_action?,criteria?,goal_ids?,depends_on?,commitment?,priority?,work_type?,body?}；ID、编号、路径和索引由程序产生，调用方不得指定。阶段须已在task_stages中定义，不替用户决定阶段含义。

先以dry-run预览，再携返回的ifMatch提交。预览不写文件、不占号，最终编号以提交回执为准。该基线保护阶段定义、目标及项目条件；另一项追加创建可在同一有效基线上安全衔接。程序在同一项目写锁内重新取号、生成稳定ID、建立任务目录/task.md、维护milestone.tasks和只增不减的task_counters；任务初始planned，默认candidate，不自动启动、更改父级状态或产生整套空上下文。

取消项、已使用计数、现存任务目录及显式改号保留的位置共同防止重复分配。多个创建使用不同operationId；同一创建重试复用原operationId，返回原稳定ID任务，不因重试建立副本。已修改原任务时仍按ID对账，原任务移除或归属不明时明确报告，不能猜建。多文件中断沿公共recover有条件回退，有后续编辑时保留现场。

本入口只支持schema2且已定义字母阶段的里程碑，不为旧T结构或旧JSON提供创建兼容分支，也不自动迁移旧项目。现有旧材料不因调用被移动或改写，用户后续自行迁移。程序不依赖core/docs。
