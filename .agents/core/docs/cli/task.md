# 聊天任务归档

一个 Codex 聊天对应一个任务；每轮保存用户原话、Agent 可见过程说明、最终答复及明确上报的路由。只使用随包 Node 标准库；不修改 Codex 原件，不保存系统指令、隐藏推理或完整工具日志，不修改 KSFAssistant。

当前聊天的运行计数和动态变量由独立 [chat](chat.md) 管理，可复用本命令安装的 Hook 分发；chat hooks 不开启正文采集。启用后 UserPromptSubmit 自动带入公共变量和接续能力的有界状态快照，注入不登记能力采用。task declare 保持只读，归档 turnNumber 仍是本档案内的序号，与 chat 接入后的原生计数分别表达。

## 接入和查询

```sh
.agents/ksf task hooks --json
.agents/ksf task status --json
.agents/ksf task sync --json
.agents/ksf task list --limit 50 --offset 0 --json
.agents/ksf task list --q 工作台 --target current:ksf-develop --json
.agents/ksf task list --target knowledge:知识/认知-业务公式/cognition.md --json
.agents/ksf task read --task <taskId> --limit 20 --offset 0 --json
.agents/ksf task read --task <taskId> --turn <nativeTurnId> --json
```

hooks 合并当前根的 `.codex/hooks.json`，保留已有处理器，接入 UserPromptSubmit、PreCompact、Stop、Interrupt；首次建立未来轮次基线，重复执行不重置。既有聊天从基线后的下一次原生轮次开始，不导入历史正文；中途启用不导入当前轮次。命令包含启动器绝对路径，移动整个 KSF 后需重新接入和审核。

项目层及具体 Hooks 通过 [Codex 原生信任流程](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks)审核，新定义或修改后的定义在信任前跳过。KSF 不修改信任记录或绕过审核；全局 Hooks、notify 和其他项目处理器保留。hook 专供宿主标准输入，失败仍退出 0，输出非阻断 JSON，不阻止任务、答复、中断或压缩。

sync 默认扫描 `$CODEX_HOME/sessions` 与 archived_sessions（默认 ~/.codex），只接入 session_meta 明确声明当前 KSF 根为 cwd 或工作区根的 transcript。它只限定采集范围，不绑定业务项目。可用 `--from -|file` 输入 `{"transcriptPath":"/absolute/rollout.jsonl"}`，仍核对身份与根。Web 启动时和每 3 秒补采，来源未变时跳过；关闭 Web 后 Hooks 与 CLI 独立工作。CLI sync 强制重查，可重建来源游标和索引。

启用归档即允许自动采集基线后的普通轮次。用户原话、过程说明和最终答复不依赖 Agent 调用 declare，也不依赖路由上报；没有可靠路由时只保留 `TASK_ROUTE_UNREPORTED`，不借用其他轮次的安排。旧采集器留下的普通 pending 空占位会在首次补采时从宿主原件修复，仍不导入启用前正文，不越过排除轮次。

## 只读声明

正文归档的全局开关通过[配置中心](../configuration-center.md)的 capture 领域管理。停用不删除既有正文，重新启用不补采停用期间开始的新轮次；已有逐聊天隐私规则保持优先。已经初始化但全局停用时，declare 仍可返回只读签名回执以表达策略，不会开启采集或写入正文。

UserPromptSubmit 向 Runtime 提供准确 turnId 与 taskId。当前 Agent 在开始、路由确认/改变、采用能力和交付前运行 `ksf task declare --from - --json`，输入如下：

```json
{
  "turnId": "native-turn-id",
  "eventId": "route-confirmed-1",
  "policy": "capture",
  "reason": "沿用已确认的项目与架构安排",
  "report": {
    "summary": "实现任务归档",
    "status": "working",
    "ownership": { "state": "none" },
    "relatedTargets": [],
    "abilities": []
  }
}
```

report 可省略，复用 [route](route.md) 的完整快照、项目、精确引用、来源和 definitionDigest 校验。reason 是可向用户说明的选择/变化依据，不保存隐藏推理。身份默认 CODEX_THREAD_ID，显式身份仅通过输入 `identity:{host:"codex",sessionId}`；不使用 cwd 代替宿主身份。每次变化使用新 eventId；同 ID 不同内容保留首次声明并标注冲突。

declare 仅读配置、密钥与定义，不写文件，规划模式可调用。`data.receipt` 为本地签名回执，必须完整出现在工具结果中；采集器只接受对应轮次的有效回执，拒绝跨会话/轮次、伪造和用户引文。截断时不伪造上报成功。readOnly 说明声明服务；共同启动器首次准备 Node 缓存仍可能写入运行目录，已接入实例已完成准备。

| policy | 含义 |
| --- | --- |
| capture | 保存本轮对话，普通只讨论、只读、不保存业务资产同样适用 |
| exclude | 本轮不记录；排除已保存正文及修订副本，其他轮次保留 |
| pause | 排除当前轮次，并暂停此聊天的后续采集，直到明确 resume |
| resume | 从本轮恢复，已经排除的轮次不回填 |

明确“本轮不记录”使用 exclude；未限定轮次的“不记录对话”使用 pause。两者优先于自动采集。没有声明时，如果可见用户输入包含对话记录限制词组，采集器先保守暂停默认采集，只保存无正文的 pending 占位及 `TASK_CAPTURE_POLICY_PENDING`；这些词组可能只是引文，不直接生成永久排除。当前轮次的有效声明可以澄清；限制尚未澄清就进入后续轮次时，继续等待明确 resume，不自动恢复。缺少可核对用户输入或策略待确认时不先存正文。排除只作用于 KSF 副本，不改宿主日志。

## 数据和恢复

- 原件位于 `档案/对话/Codex/<taskId>/task.json` 及 `turns/<turnId>.json`。taskId 复用 routing/v1 本地密钥的匿名会话标识；元数据不保存原始宿主聊天 ID。原文中的 ID 保持原样。
- 每轮保存协议、原生 turnId、稳定派生的 KSF roundId、状态、消息与修订、全部路由变化及缺口。按原生消息 ID 去重，保留角色、阶段、时间、顺序和内容块。附件保留结构与引用，不复制成果版本或下载资源。
- 本地控制与游标位于 `.agents/runtime-data/task-capture/config.json`、sources/、locks/、last-sync.json。只重建索引时保留 config 基线及 routing/v1/identity.key，不能随意清空整个运行目录。
- 游标记录采集策略版本，版本变化时即使宿主文件未追加，也从启用基线重新核对；不靠手动改档案或伪造旧轮次声明修复空记录。待确认的限制只保存无正文控制标识，已明确排除的 tombstone 保持有效。
- 同任务锁与最新基线合并，同目录 fsync 暂存和原子替换。轮次先发布，task.json 为可重建摘要；中断后 sync 修复。来源缩短、压缩或移动不删除已归档消息。仅回收可证明原进程退出的本机锁；存活、权限未知或 PID 被复用时保留锁并报告 TASK_LOCKED。
- 任务档案成为新路由投影的事实源，完整路由原件不受旧 50 条历史与 4096 次事件上限限制。旧 route API 只投影最近 50 次，完整变化在 turn 查询中。旧 v1 数据保留，不猜配历史轮次。已采用任务档案的聊天继续用 task declare；旧 start/write 拒绝更新该聊天，避免两份事实源。
- completed、interrupted、pending、partial、excluded 为采集状态；Agent preparing/working/completed 等为声明状态，两者不等于宿主实时状态。

Codex JSONL 不是稳定接口，适配器与归档协议分离。未知格式、缺少消息 ID、损坏记录、读取失败明确报缺口并保留原件。查询不创建文件；sync/Hook 才采集。config.enabled 为 false 时同步与 Hook 零采集写入，declare 报 TASK_CAPTURE_DISABLED。首版不支持其他宿主、后台常驻服务、纠错分析、频率统计或知识提炼。

JSON 信封为 `{ok,command:"task",operation,data,errors}`。分页 limit 1–100、offset 非负；不带 turn 的 read 只返回轮次摘要。常见错误为 TASK_DATA_INVALID、TASK_CONFIG_INVALID、TASK_SOURCE_UNSUPPORTED、TASK_LOCKED、TASK_DECLARATION_CONFLICT。普通失败退出 1，参数错误退出 2，hook 始终非阻断。

实现见 [采集服务](../../runtime/src/services/tasks.js)、[适配器](../../runtime/src/task-capture/codex.js)和[测试](../../runtime/tests/tasks.test.js)。

任务查询提供独立 `latestReported`（上报轮次、轮次序号、事件、时间与路由）；最新轮次未上报时不清空该字段，也不修改最新轮次的 route/null 语义。列表 `--q` 搜索标题、最近路由简述、主项目与能力名称，`--project` 使用返回 projects 中的 value，均在分页前执行；轮次摘要增加 turnNumber。只读 Web 的路由页可用 messages=0 省略正文。

采集器排除宿主 session_meta.source 明确标注 subagent 的内部工作线程，不把内部审查/压缩/文档工作线程列成用户聊天任务；只存在 parent_thread_id 的用户聊天分支仍正常采集。显式要求同步内部线程返回 TASK_SOURCE_INTERNAL，内部线程 Hooks 直接跳过。

## 项目视角的历史查询

`ksf task list --project <key> --project-match history --json` 只按全部轮次、全部路由事件中的主项目匹配；引用某项目不建立聊天归属，引用项目的查询不会因此收录聊天。历史上切换过主项目的聊天仍可出现在各历史主项目下。未指定该模式时保留最近上报项目的原查询语义。历史搜索仍覆盖任务简述、主项目与引用项目事实及专业能力，先筛选后分页。

Web `GET /api/task-projects` 从历史主项目聚合项目目录，返回 key、label、project、chatCount、turnCount、primaryTurnCount、referenceTurnCount、lastReportedAt 和 errors。chatCount 与 turnCount 只计主项目归属（或相应虚拟状态），引用项目不增加归属计数。referenceTurnCount 兼容保留为已归属聊天内的仅引用轮次数，不参与导航、默认定位或最近主项目上报选择。同轮先作为主项目、后仅被引用时，最近相关上报仍取主项目事件。聊天和正文只保存一份。无项目、待确定、未上报、未记录分别使用 state:none、state:unresolved、unreported、state:excluded。

`GET /api/tasks?projectMatch=history&project=<key>` 的聊天摘要增加 projectContext，含相关轮次数、最近相关上报与默认定位的 latestTurnId。`GET /api/tasks/:taskId?project=<key>` 仍返回完整聊天的分页轮次，每轮补充 projectHistory（全部关联、主项目变化顺序、是否切换）及 projectRelation（本项目、仅引用、其他项目或缺失状态）。轮次正文接口也接受 project 上下文，增加 turnNumber，不改变原文。latestReported 和 lastTurn 继续表示聊天整体的原有语义。

项目投影仅使用明确上报。项目键沿用 scope:name，不将 current 与 archived 同名引用合并。读取失败单独返回 errors，可核对的轮次继续展示；缺失记录不补造归属。查询不写入文件，采集策略、Hooks 和档案协议不变。

## 四类目标的统一归属查询

新入口 `GET /api/task-targets` 只聚合各轮全部历史事件的主归属。返回 targets（key、kind、label、target、chatCount、turnCount、lastReportedAt）、totalChats、errors；HTTP 另含 capture。kind 为 project、knowledge、ability、archive 或 state，知识以 `knowledge:<精确入口路径>` 为键，项目键继续为 current:name / archived:name。无记录的目标不会预铺菜单，关联对象不增加归属聊天或轮次数。同轮多次以同一目标为主归属只计一轮，历史切换过的主归属分别保留。四种虚拟入口为 state:none（无归属）、state:unresolved、unreported、state:excluded。

`task list --target <key>` 与 `/api/tasks?target=<key>` 按历史主归属匹配，先搜索／筛选后分页；搜索覆盖历史任务简述、主归属和关联对象名称、专业能力。`task read --task <id> [--turn <id>] --target <key>` 及对应 HTTP 详情／轮次接口提供 targetContext、targetHistory、targetRelation。context 含 key、turnCount、relatedTurnCount、latestTurnId、latestReported；相关仅作补充，不决定归属或默认轮次。history 保存完整归属顺序与切换标记，relation 表示本项目、本知识单元、仅关联、其他归属及缺失状态。轮次列表仍是完整聊天，不隐藏其他目标的轮次。latestReported、lastTurn 的聊天整体语义不变；当前归属最近上报使用 context。

`target` 最长 4096 字符，不能与 project 同时提供。旧项目接口、--project / --project-match 和 project 上下文继续兼容；知识主归属不会伪装成旧无项目入口。存量档案只在查询时规范化，不迁移、不补造知识记录。知识来源不可用仍保留历史名称与路径，在详情显示来源现状，不按同名合并；聚合同时返回读取缺口。

## 能力、档案与待创建目标

`task targets --json` 为只读目录查询，与 `/api/task-targets` 共用聚合。target 支持四类：

- 项目：`{kind:"project",name,scope:"current"|"archived"}`。
- 知识：`{kind:"knowledge",path:"知识/单元/实际入口.md"}`，核验根导航。
- 能力：`{kind:"ability",ref:"partner.example.method@0.1.0",source:"user"}`。ref 可不带版本，此时核对该来源实际版本；记录保存 ID、精确 ref、实际来源、版本、个人修订、定义路径和摘要。导航键为 `ability:<实际来源>:<id>`，版本更新不拆分目标；它不自动进入 report.abilities。
- 档案：`{kind:"archive",path:"档案/企业/示例企业/合同.pdf"}`，也可指向明确目录。普通文件／目录检查不读取或下载原件内容，不强制入口文件；键为 `archive:<精确相对路径>`。越界和符号链接拒绝。

新目标尚未创建时，在 ownership.target 或 relatedTargets 明确传 `{kind,lifecycle:"planned",name}`。declare 返回 targetId（64 位不透明标识）、targetVersion:1，导航键为 `target:<targetId>`。同会话、同轮次、同 eventId、同位置的重复声明得到同一身份；同名不同声明不自动合并。跨轮／跨聊天通过 `{kind,targetId}` 复用已采集身份。具体目标也不明确时使用 ownership.state:unresolved；不要声明虚构的待创建名称。

创建后用新 eventId 声明显式绑定，report 继续引用同一 targetId：

```json
{
  "turnId": "native-turn-id",
  "eventId": "target-bound-1",
  "policy": "capture",
  "reason": "已按授权创建并核验该能力，沿用原目标身份",
  "targetBindings": [{
    "targetId": "<回执返回的64位目标身份>",
    "ifMatch": 1,
    "target": {"kind":"ability","ref":"partner.example.method@0.1.0","source":"user"}
  }],
  "report": {
    "summary":"完成能力设计",
    "status":"completed",
    "ownership":{"state":"bound","target":{"kind":"ability","targetId":"<同一目标身份>"}},
    "relatedTargets":[],
    "abilities":[]
  }
}
```

示例占位需替换为真实值。绑定要求目标存在、类别一致、ifMatch 为当前版本；一次声明内绑定对象必须出现在主目标或关联对象中。绑定成功版本为 2，后续按稳定身份解析当前定义；本版不提供已绑定对象的任意转绑或自动同名合并。版本冲突、实际定位已被另一身份绑定或来源改变时不覆盖。declare 只返回签名安排，最终接受以采集结果为准；采集时重新核验版本和来源，同 ID 重复回执不重复登记。

长期事实存放在原所属轮次的 targetFacts 与签名声明中，旧 route 会话使用其记录内的 targetFacts；与所属记录同目录原子发布。使用全局目标锁串行校验跨聊天绑定，存活或身份未知的锁不移除，仅恢复可证明死亡的进程锁。路由旧快照截断不截断 targetFacts，旧 v1 总容量限制保持。身份目录和定位别名由事实重建，不另建业务任务数据库；运行锁在 `.agents/runtime-data/task-targets/`，查询和 declare 不创建文件。

采集策略在目标事实保存前判断，排除轮次不登记目标／绑定，后续明确排除也移除该轮事实；其他允许轮次已明确保存的同一目标证据继续有效。routing.enabled 关闭时不接受新目标事实，即使旧回执尚在等待采集；原有记录保留。失败不阻断正文采集，冲突事件保留技术证据并标记缺口，不伪造绑定成功。

目标目录附加 lifecycle、aliases、目标版本和来源现状。aliases 只来自明确绑定；旧物理键无独立历史主归属时可定位稳定身份，有独立历史时保留原上下文，不迁移旧档案。历史节点保留当时待创建状态与路径；currentBinding 只是后续绑定信息，查询不把它改写成过去已经存在。能力版本更新不增加归属目标，绑定落成不增加目标切换。
