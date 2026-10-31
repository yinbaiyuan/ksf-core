# KSF合作 CLI

应用 ID：`com.ksf.cooperation-center`。CLI 与窗口共用后端；A、B 都是 KSF 实例。

所有命令使用 JSON 输入，信封为 `{ "operationId": "稳定 UUID", "params": { ... } }`。读操作可省略 operationId。写操作重复同一编号返回原结果，改变内容须换编号；修改任务必须先 `task.get` 取得 revision。不要因超时直接换编号重试。

| 命令 | params |
| --- | --- |
| peers | 无，读取已配对实例与 nodeId |
| task.create | peerId、offerId?、offerRevision?、goal、materials?、offerInputs?、parentId?、taskId? |
| task.rework | 同 create，增加已结束任务的 relatedId |
| task.list | view: attention/accepted/sent/history、query?、status?、peerId?、offset?、limit?、archived? |
| task.get | taskId |
| task.action | taskId、revision、action: accept/start/wait/ready/decline/cancel/pause/resume/archive；progress?、reason? |
| task.comment | taskId、revision、text |
| task.material | taskId、revision、materials、goal?、offerInputs?（发起方替换请求内容） |
| task.deliver | taskId、revision、summary、materials? |
| offer.list | 无，读取本机声明、草稿、授权及可用 AI 配置；仅本机调用可见 |
| offer.preview | offerId、offerRevision，读取本机声明的处理依据 |
| peer.offers / peer.offers.refresh | peerId，读取／刷新对方公开声明目录、支持状态及 syncedAt |
| policy.list / policy.match | 旧查询别名，对应 offer.list / offer.preview；不再按 peerId 匹配规则 |
| sync.status / sync.retry | 无，读取队列及诊断／核对原操作并尝试补送 |
| task.export | taskId? 或 task.list 筛选；每次最多 100 条，返回本机导出文件路径 |
| conversations | 无 |
| message.send | nodeId、text、attachments?，稳定 operationId |
| message.status / message.reconcile | operationId 指定原消息，不重新发送 |

materials 是已导入材料引用 `{digest,name,size,mediaType}`。窗口可上传文件。CLI 可使用任务已有材料引用；不能通过本机路径读取任意文件。方案确认、规则授权、需人工确认的成果提交和未知执行后的重新安排必须在 B 的窗口操作。传入 human、confirmed 等字段不授予权限。

创建任务前先调用 peer.offers.refresh，并用 peer.offers 确认 supported=true，选择目录里的 offerId 和 revision（传入 offerRevision）。未指定时采用常驻的 manual v1。未确认支持声明协议时拒绝创建，返回 COOP_OFFERS_UNSUPPORTED；已支持的离线实例可使用缓存目录发送，任务持久排队，不降级为普通消息。送达回执仅表示材料已入库；任务状态以业务事件为准。B 提交成果即完成，A 后续修改应创建关联请求。复制到其他实例的数据仅用于查看，不自动发送或执行旧任务。

材料命令：`material.text` 以 `{name,text}` 导入最多 512 KiB 文本；`material.import` 以 `{materialId}` 将本应用已上传的材料保存在长期目录；两者都需要稳定 operationId。`material.read` 以 `{digest}` 读取最多 512 KiB 文本；大文件在窗口下载或从导出目录读取。人工可通过 `task.action` 的 `publish_summary` 公开主任务的协助摘要，子任务材料不会自动共享。

声明管理 `offer.save` 仅供本实例窗口，需稳定 operationId 和全局 ifRevision，字段为 offerId、name、description、inputs、outputs、handling、delivery、instructions、scope、published。公开目录只含 offerId、revision、name、description、inputs、outputs、handling、delivery。旧 policy.save 和 peerId 规则写入不再支持。

B 窗口重新安排 Agent 时，在 task.action 的 retry_agent 中明确选择当前已发布的 Agent 声明 offerId、offerRevision；CLI 不能执行此确认。声明失效时任务进入待 B 处理，保留当时快照和原因，不自动切换。

## Agent 与工作流扩展（0.4.0）

- execution.catalog：本机 API/CLI 执行配置、Desktop 可连接状态和当前项目目录。
- workflow.catalog：可绑定的应用工作流描述；仅本机使用，包含固定包摘要。
- task.result：Desktop 明确成果登记，输入 taskId、revision、runId、executionToken、status(completed/waiting)、summary/reason、materials；必须匹配持久运行与任务版本。该接口不能确认方案、发布声明或代替 B 提交确认。
- task.get：增加 runs、声明快照、offerInputs，以及发起方本机 workflowOrigin 与 callback 状态。callback=acknowledged 仅表示原应用持久接管。

声明保存增加 target(provider=api/codex-cli/codex-desktop，Desktop 使用 project)、inputFields、workflow 绑定。工作流的 fixedInputs 和执行配置只在本机保存，公开目录仅增加白名单 inputFields；新表单/工作流要求 workflow-offers-v1 能力协商。旧实例只看到能理解的声明。

业务应用使用宿主 `cooperation.request` 发送，先持久保存 workflowRunId、waitId、taskId、peerId 和 operationId。CLI 不能用 workflowOrigin 或 caller 字段冒充提供应用。新 SDK 示例与[契约](workflows.md)包含原等待点接管、暂停恢复和去重实现。
