# 项目管理数据与接口说明

项目管理责任由项目管理搭档持有，规划、推进与检查点恢复、验收与项目归档分别由对应基本功持有。程序中的 project-management、projects、project-transitions 与 repositories 模块提供结构、依赖、版本、路径和物理操作。项目管理使用已核实的项目事实与来源入口，外部材料导入由独立能力处理。本文解释旧格式已实现的数据与接口，不增加专业判断或运行步骤。

后续项目治理的文档组织与信息归属，以[项目文档架构与治理指南](project-management/document-architecture.md)为核心设计基线。本文继续描述未迁移项目的JSON接口；新格式使用[治理文件协议与接口](project-management/governance.md)。根卡包含governance_schema时，旧management接口明确拒绝，避免把冻结JSON当作现行安排。

## 共同项目模型

一份 `项目管理.json` 保存一个项目的现行管理事实。项目根卡保留目标与入口，详细管理安排由该主件持有；旧检查点仍为原位恢复材料，聊天为来源，运行会话不等于业务事项。未采用管理机制的项目继续正常阅读，不自动创建文件或从目录推断承诺。

文件信封为 `{schemaVersion:1,revision,updatedAt,lastOperation,plan}`。`plan` 包含：

| 内容 | 语义 |
| --- | --- |
| purpose、scope、summary、reviewedAt | 目标、范围、当前判断及最后实际复核时间 |
| goals | 稳定 id、目标、成功条件 |
| stages、currentStageId | 阶段、关联目标、承诺成果、验收条件、记录状态 |
| items | 稳定事项身份、关联目标/阶段、产物、承诺、优先级及理由、负责人、依赖、下一行动、验收和来源 |
| risks | 风险、影响、应对、负责人、状态与复核条件 |
| decisions | 决定/待决问题、理由、影响、采用状态及重评条件 |
| wipLimit | 项目约定的在制工作上限；运行进程上限由执行宿主另行管理 |

事项状态为 backlog、ready、in_progress、blocked、paused、review、completed、cancelled；承诺为 candidate、next、now。状态与承诺分别表达。`ready` 仍须通过依赖、阻塞、阶段和容量检查；可做不产生新的执行授权。父子/阶段归属不是硬阻塞，硬依赖由 `dependsOn` 显式表达。循环、失效关联与重复身份拒绝保存。

验收条件为 `{id,text,result,evidence,reviewer,reviewedAt}`，result 为 pending、passed、failed。证据为实际本地相对路径或 HTTP(S) 来源；passed 记录复核者与时间。completed 事项/阶段必须有条件、全部 passed 且有证据。程序只校验结构与入口，不能代替内容真实性、用户验收或实际操作。

旧检查点可显式关联为 `source:{path,taskId,digest,state}`。该状态是来源快照；与现行事项状态不同，不自动同步或覆盖原文。新事项不要求新建聊天或检查点，产生跨会话恢复需要时再按既有规则建立原文，并保存关联。来源变化应提示重读，不能继续盲信导入快照。

## 保存、恢复与冲突

read/check 不写业务文件。写入必须提供上次读取的 `ifMatch` 摘要与唯一 operationId；同一操作重放对账，同 ID 不同内容拒绝。共享项目锁协调归档与写入；单文件通过临时文件、刷盘和原子替换发布，保留并发编辑。未知格式、损坏或非法路径保留原件，不以空计划覆盖。归档项目只读，明确恢复后再推进。

跨文件导航和检查点不声称原子事务。管理主件保持在项目中随项目备份/归档；应用私有存储仅保存显示偏好与会话操作身份。

## 数据字段与调用补充

goals 为 `{id,title,successCriteria}`。stages 为 `{id,title,goalIds,description,criteria,state}`，state 为 planned/active/completed/cancelled。items 为 `{id,title,goalIds,stageId,description,state,commitment,priority,priorityReason,owner,dueDate,dependsOn,blocker,nextAction,acceptance,links,source}`；未提供文本用空字符串，列表用空数组，source 无关联时为 null，dueDate 为可选 YYYY-MM-DD。

risks 为 `{id,title,impact,response,owner,state,reviewTrigger}`，state 为 open/mitigating/closed。decisions 为 `{id,title,rationale,impact,state,reviewTrigger}`，state 为 proposed/adopted/superseded。id 使用字母开头的字母、数字、下划线/短横线，最多 80 字符，全计划内唯一；标题变化不更换 id。优先级为 high/normal/low，排序仅作参考，价值判断由 Agent 说明。

本地 evidence、links 与 source.path 均为当前 KSF 根相对路径；证据不自动联网取回。来源原件或验收证据在保存后变化/缺失时，读取保留管理内容并警告；修订时重读来源、补齐有效入口再保存，不能把来源缺失当作原成果从未发生。

只有最近一次写入操作回执保存在主件中；后续写入之后重试更早操作将受旧 ifMatch 拒绝。应用保留草稿、基线及操作号，重新读取后按稳定 ID 三方合并，不自动覆盖重叠修改。此机制防止丢失更新，不是完整历史版本库。跨项目相对引用在归档后按原 project referenceReview 复核，不批量改写历史材料。
