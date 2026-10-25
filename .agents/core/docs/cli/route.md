# 会话路由记录

`route` 保存当前 Agent 明确报告的任务安排，独立于 Web 和 KSFAssistant。使用随包 Node.js 标准库，不启动 Agent、不推测归属，也不采集聊天或工具日志。运行约定见[路由上报](../runtime/route-reporting.md)。

## 命令

```sh
.agents/ksf route start --from - --if-match missing --json
.agents/ksf route write --from - --if-match 1 --json
.agents/ksf route read --json
.agents/ksf route read --session <sessionKey> --json
.agents/ksf route read --from - --json
.agents/ksf route list --limit 50 --offset 0 --json
.agents/ksf route --help
```

`--from -` 从标准输入接收不超过 64 KiB 的 UTF-8 JSON，也可指定相对当前 KSF 根的 JSON 文件。`read --from` 只接受 identity。身份不支持 argv 参数；`--session` 接收的是查询返回的本地会话标识。

start/write 输入示例（通过标准输入传入）：

```json
{
  "eventId": "unique-event-id",
  "report": {
    "summary": "检查项目方案",
    "status": "working",
    "ownership": {"state": "bound", "target": {"kind": "project", "name": "示例项目", "scope": "current"}},
    "relatedTargets": [],
    "abilities": [
      {"ref": "partner.example.reviewer@0.1.0", "source": "user", "stage": "adopted", "definitionDigest": "替换为对象读取返回的64位definition_digest"}
    ]
  }
}
```

示例项目与能力必须换成实际存在的对象，不会由命令创建。`write` 还必须提供 start 返回的 `accepted.roundId`，放在输入顶层 `roundId`。每次输入是完整快照，省略旧能力并不表示保留它；relatedTargets、abilities 可以为空数组。

## 身份、轮次与版本

默认身份为 `host: codex` 与环境 `CODEX_THREAD_ID`。其他宿主或无环境时，在输入增加 `identity: {host, sessionId}`，host 为小写字母开头的字母/数字/连字符名称。缺失身份明确报错，不用 cwd、项目名或摘要代替原生会话身份。

本地随机密钥与 HMAC-SHA256 生成 sessionKey；密钥和记录分别为 `.agents/runtime-data/routing/v1/identity.key` 与 `<sessionKey>.json`，目录 0700、新文件 0600。原始 sessionId 不落盘。同一会话在不同 KSF 根有不同标识，密钥不可与已有记录分离清理。宿主原生轮次 ID 不作为前提；start 每次生成 KSF 处理轮次 UUID。

先 read 取得 `data.record.revision`；无记录时 start 使用 `--if-match missing`，已有记录的新轮次使用实际 revision。write 只能更新当前 roundId 和实际 revision，不能重新开启旧轮次。冲突后读取并核对，不盲目替换版本重试旧轮次。

eventId 在同一会话内唯一。同 ID、相同操作与快照重试不写入；同 ID 不同内容报冲突。重放返回 `replayed: true`，`accepted` 指向原操作，`record` 是最新记录；原轮次已结束时不能把 accepted 当作当前轮次。预期版本不参与事件内容摘要。源后来变化不妨碍已接受事件重放。

## 路由事实与来源

- ownership.state 为 bound / none / unresolved，只有 bound 携带 target；每次安排一个主归属。项目 target 为 `{kind:"project",name,scope:"current"|"archived"}`，通过现有 project 服务核实；知识为 `{kind:"knowledge",path:"知识/认知-业务公式/cognition.md"}`，只接受 `知识/knowledge.md` 明确链接的单元入口及实际普通 Markdown 文件，不固定入口文件名，不读取目录推测。路径越界、符号链接和未登记入口拒绝。
- relatedTargets 是明确关联的项目／知识数组，不建立聊天归属。最多 32 个，不与主归属重复；归属不代表正文已经更新，也不授予写入权。目标均保存历史名称、路径，查询失效时附加 unavailable，不改绑同名单元。
- 旧 project.state/primary 与 references 输入仍有效，读取层映射为 ownership/relatedTargets。一次请求混用新旧字段报错；新快照同时保存旧项目字段的兼容投影。知识主归属的旧 project 投影为 none，但新的归属聚合与兼容项目查询会识别知识，不把它当作无项目。存量档案不改写。
- 能力使用四类精确 `id@version`、source 和 stage（selected / read / adopted）。source 可为 effective、user、system 或已关联源 ID，写入时保存实际来源。沿用固定保护、个人优先、多源歧义与精确版本规则。
- read/adopted 必须提供对象 read 返回的 `definition_digest`，selected 可省略。程序核对入口文件 SHA-256、元数据和解析位置；摘要不覆盖能力的所有附属资源，不证明 Agent 真正理解或执行了方法。stage 是 Agent 声明。
- 查询为当前快照附加 freshness：current / changed / unavailable；effectiveChanged 单独表示有效来源被替换，不能核实时为 null。保存原来源与摘要，不改绑、不重写历史；能力变化不清除项目归属。
- status 是 Agent 上报的 preparing / working / waiting / blocked / completed / paused / cancelled，不是宿主实时状态；updatedAt 为服务器接受报告的时间。

## 开关、存储与查询

`settings.routing.enabled` 默认 true，可通过 user-data settings 的正常版本检查写入 false。start/write 此时返回 `skipped: true, reason: disabled`。`--no-save` 或 `KSF_ROUTE_NO_SAVE=1` 返回 reason: no-save。两种情况均不创建路由目录、密钥、锁或记录；参数仍需合法。明确禁止保存时 Agent 不应调用写入命令。

每次接受报告增加 revision；单文件原子发布当前快照、最近 50 次关键上报历史和事件去重凭据，historyDropped 明确记录截断数量。去重凭据不会随历史快照截断而丢弃；每会话最多 4096 次事件、单记录最多 4 MiB，达到限制后拒绝新增，保留原件，不自动清理或建立新身份。

read/list 不创建路由文件。list 默认 limit 50，范围 1–100，offset 默认 0；按更新时间倒序、同时间按会话标识排序，返回 total、nextOffset、complete、records 和逐记录 errors。列表不返回历史或去重凭据；read 返回历史，不返回去重凭据。损坏记录不会当成无记录覆盖，list 可返回其他有效项并退出 1。

命令沿用 `{ok, command:"route", operation, data, errors}`。read 无记录为正常结果 `state: missing, record: null`；start/write 的 data 含 skipped、replayed、accepted 与 record。参数错误退出 2，存储、解析或冲突失败退出 1。

主要错误：ROUTE_IDENTITY_REQUIRED、ROUTE_CONFLICT、ROUTE_ROUND_CONFLICT、ROUTE_EVENT_CONFLICT、ROUTE_DEFINITION_CHANGED、ROUTE_LOCKED、ROUTE_PATH_INVALID、ROUTE_RECORD_INVALID、ROUTE_VERSION_UNSUPPORTED、ROUTE_KEY_INVALID、ROUTE_CAPACITY。损坏文件、未知协议、遗留锁和替换锁均保留；确认无活跃写者后再人工处理遗留锁。

共同启动可能准备随包运行时；这里的零写入指路由操作，不改变[启动器](runtime.md)的已有契约。Web 查询契约见 [web](web.md)。

## Codex 任务档案投影

接入 [task](task.md) 后，查询优先投影同聊天的逐轮档案，完整历史位于 task turn 读取中；旧 v1 文件保留。该聊天继续用只读 task declare 上报，旧 start/write 返回 ROUTE_TASK_ARCHIVE_ACTIVE，防止两份事实源。投影的最近 50 次上限仅影响旧 route 视图，不截断长期路由原件。

## 四类目标与稳定身份

ownership/relatedTargets 另支持能力 `{kind:"ability",ref,source}`、档案 `{kind:"archive",path}` 和待创建 `{kind,lifecycle:"planned",name}`。复用身份为 `{kind,targetId}`。start/write 顶层可提供 targetBindings，使用 targetId、ifMatch 和实际目标定位；与 report 同次提交，绑定对象必须出现在安排中。来源、身份、版本和原子发布先核验，冲突不覆盖；同 eventId 重试保持幂等。完整字段与四类目标含义见 [task CLI](task.md#能力档案与待创建目标)。

旧会话在自身 targetFacts 保存目标身份和绑定事实，不受最近 50 条快照截断；现有 4096 次事件及 4 MiB 总容量仍有效。no-save、关闭 routing 或不允许记录时不新增目标事实。已接入任务采集的聊天仍使用 task declare，不回到 start/write。
