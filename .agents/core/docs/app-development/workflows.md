# 应用工作流与合作任务回调

此接口从 Core 0.3.5 起提供，SDK v1。流程定义、节点、分支、人工审批、暂停和恢复由提供应用管理。Core 只提供固定方法、真实调用身份、版本核验、材料转交和合作结果通知。

## 提供工作流

应用清单声明 `"workflows":{"contractVersion":1}`，需要 Node 后端及 `background` 权限。后台 `call(method,input,caller)` 实现下列方法；核验 `caller.source === 'workflow'`，不能把普通 CLI 参数当作宿主身份。

| 方法 | 输入与返回 |
| --- | --- |
| workflow.list | 返回 WorkflowDescriptor 数组，最多 100 项 |
| workflow.describe | workflowId → 当前固定 revision 的描述 |
| workflow.start | 预生成 runId、workflowId、workflowRevision、taskId、contentDigest、goal、materials、inputs → 运行状态 |
| workflow.get / workflow.reconcile | runId → 原运行状态；未知结果只按原编号核对 |
| workflow.cancel | runId、operationId → 原运行的实际停止状态 |
| workflow.signal | 原运行和等待点的结果事件 → 持久接管后返回确认 |

描述包含 `id/revision/name/description/inputs/outputs`。输入字段的 key 使用稳定短编号，类型为 text、textarea、number、boolean、select、materials；枚举声明 options。输出支持 text 与 materials。启动返回 `{runId,status,revision,progress,waitReason,actionLabel,result?}`，状态为 queued、running、waiting、paused、ready、completed、failed、cancelled、unknown。ready/completed 必须包含明确成果；会话结束、网络送达不表示成果成立。

KSF合作由本机 B 的有效窗口选择应用、流程，固定包摘要和流程 revision，配置对外字段与本机固定值、成果说明和材料映射。具体绑定、目录、权限和本机固定值不进入公开目录。声明改动或应用包摘要变化不会自动启动新运行。普通已配对实例仍然只能选择公开声明，不能直接指定本机执行方法。

目标与主材料自动传入。字段材料和成果材料均为 `{digest,name,size,mediaType}`，文件保存在各应用 dataDirectory 的 `materials/<sha256>`。宿主核对大小和摘要，拒绝符号链接及越界路径，再复制到对应应用。接口不接收任意本机文件路径。

应用使用自身已获权限执行内部步骤；声明不替提供应用授予新权限。内部人工审批在提供应用的真实窗口完成，需核验 caller 和具体成果 revision。KSF合作中的 B 提交确认是独立步骤，提交后任务即完成。

## 原流程发出任务

发起应用同时声明 `cooperation.request` 权限。后端使用：

```ts
import {createCooperationClient} from '@ksf/sdk/workflows';
const cooperation = createCooperationClient(context);
// 必须先在应用事务中保存 runId、waitId、taskId、peerId 和稳定 operationId。
await cooperation.request({operationId, taskId, workflowRunId: runId, waitId,
  peerId, offerId: 'manual', offerRevision: 1, goal, materials: [], offerInputs: {}});
```

`workflow.get` 需返回原运行及 `waits:[{waitId,taskId,peerId,...}]`，宿主核验等待点确已存在。任务、仅本机可见的发起应用/运行/等待关联和待发送事件在KSF合作同一事务保存。不得按目标文字或流程名称关联。重试使用原 operationId 和完全一致的请求，不能生成第二次合作任务。

KSF合作收到完成、拒绝、取消结果后，在保存成果的同一事务生成持久回调事件。宿主只向 A 本机持久绑定的应用发送 `workflow.signal`：

```ts
{eventId, runId, waitId, taskId, sourcePeerId,
 outcome: 'completed', // 或 declined、cancelled
 delivery: {version, summary, digest, materials}}
```

B 的消息不能提供回调应用、运行、方法或地址。接收应用在自己的事务内校验等待点、保存 eventId 并推进原节点，持久成功后返回 `{accepted:true,eventId,paused?:boolean}`。重复事件须返回同一确认，不再次推进；即使原流程已经因该事件结束，也应能确认重复投递。

暂停流程保存结果但不推进节点；恢复时由应用消费尚未推进的结果。已结束或失效的等待点不创建新流程。应用停用、包摘要变化或回调失败时，KSF合作保留事件与原因，并按原事件重试。任务“成果已收到”和“原流程已接管”独立展示；接管不表示后续流程执行结束。后续返工须使用新 taskId 和新 waitId。

## SDK 与可运行示例

`@ksf/sdk/workflows` 导出类型及 createWorkflowClient/createCooperationClient；宿主绑定调用 appId，接口参数无法冒充其他应用。workflows 客户端的目录、描述、启动、查询、对账、取消由KSF合作权限控制；业务应用只需 cooperation.request 发起任务并实现上述提供接口。

[SDK 示例](../../applications/sdk/templates/workflow-provider/README.md)实现自己的 SQLite 流程、材料整理、人工复核、并行等待点、暂停恢复和事件事务去重。通过 `ksf-app create <目录> --template workflow-provider` 生成项目；按[应用快速开始](quickstart.md)构建和本机安装。测试脚本使用隔离实例，不能代替 Windows、实际模型和日常实例验收。
