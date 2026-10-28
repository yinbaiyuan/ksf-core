# AI 任务服务首版接入说明

应用开发的唯一入口为[应用开发者手册](app-development/README.md)，公共调用契约见[统一AI接入](app-development/ai.md)。本文保留架构/实例操作及既有验证依据；接口新增包括describe、事件hasMore和SDK材料上传辅助。
本页说明已实现的调用方式和边界；职责、生命周期与架构约束以[设计主件](ai-task-service.md)为准。模型质量与真实业务验收分别记录，不以接口可用代替。

## 配置与调用

工作台「系统设置 → AI 任务服务」配置连接与执行配置。设置保存在当前实例的 `.agents/user-data/ai/`，与浏览器偏好分开。先保存连接，再检查连接，最后配置应用使用的 profile ID。

- DeepSeek 连接使用 `kind: api`、`protocolId: deepseek-responses-v1`、`baseURL: https://api.deepseek.com`、`credentialRef: env:DEEPSEEK_API_KEY`、`concurrency: 1`，模型为 `deepseek-flash`。供应商、默认模型和变量名已由用户确认；仍需配置真实账户并验收。只保存凭据引用，后台服务需要实际具备对应环境变量；连接检查仅证明本地配置与引用存在，未发起模型请求。
- 另保留 `openai-responses-v1` 和 `openai-transcription-v1`，对应 OpenAI 文本/专用文件转写，基础地址示例为 `https://api.openai.com/v1`、凭据引用 `env:OPENAI_API_KEY`。切换供应商使用明确协议，不能仅改地址推定兼容。
- Codex 连接使用 `kind: codex`、可执行文件绝对路径、可选的 `codexHome`、并发额度。检查执行 `--version` 与 `login status`，不读取或复制认证文件。首版明确限定已经验证的 `0.163.x`，其他版本需先验证适配。
- 执行配置声明 `id`、`executorId`、`enabled`、`model`（API 必填）、`timeoutMs`（1000—3600000）、`maxAttempts`（1—5）、`retryDelayMs`（0—60000）、`maxInputBytes`（最多 128 MiB）、`maxOutputBytes`（最多 512 KiB）；可选 `maxOutputTokens`、`reasoningEffort`。模型选项是否受供应商支持仍需真实调用核对。

SDK v2 应用后端可以直接调用公共服务，或打包使用 SDK 的 `createAIClient(context)`：

```ts
import { createAIClient } from '@ksf/sdk/ai-tasks';

const ai = createAIClient(context);
const accepted = await ai.submit({
  contractVersion: 'ai-task-v1',
  idempotencyKey: 'meeting-2026-10-27:minutes:v1',
  profileId: 'text-deepseek',
  instruction: '整理纪要，区分决定与提议，缺少信息时明确保留未知。',
  inputs: [{ kind: 'text', name: 'transcript', text: '虚构会议材料' }],
  outputSpec: { format: 'text', mediaType: 'text/markdown' },
  context: { businessRunId: 'meeting-2026-10-27', stepId: 'minutes' },
});
// 与业务步骤一起保存 accepted.aiTaskId，再退出普通 RPC。
const current = await ai.get(accepted.aiTaskId);
```

底层方法为 `context.services.call('ai', method, paramsArray)`。公共方法为 describe、submit、get、cancel、events、register、readResult。前端先调用自己的应用后端，appId/version/releaseDigest 由受管进程的服务桥绑定。客户端提交 appId 会被拒绝。v1 应用不强制迁移，原 workspace/tasks 服务签名不变。

`watch(id, {afterSeq, signal, intervalMs})` 使用有界短轮询；断开 UI 订阅不取消任务。先按hasMore排空当前事件分页，再在终态或 reconciling 返回，应用按业务规则继续处理或等待核对。生成结果的最终 revision 应与业务步骤一起保存，避免重复推进。

## 材料与结果

`register({name,mimeType}, text)` 支持最多 512 KiB 文本；普通提交总请求最多 768 KiB。引用使用 `{kind:'material',materialId,sha256}`。材料归属、大小与摘要会核对，不接受任意工作区路径。

音频走 `POST /api/ai/material-upload?instanceId=<有效应用租约>&name=<编码后的文件名>`。正文为二进制流，MIME 放在 Content-Type，使用当前工作台 X-KSF-Token 与同源保护；最多 128 MiB。上传不代表转写适配器接受该大小。首版转写单文件上限 25 MiB，支持所声明的音频格式；时长和实际解码由供应商验证。输出 `{text,segments:null,speakers:null}`，不造时间戳和说话人。

JSON 输出根类型为 object，所有对象显式 `additionalProperties:false`，字段列入 required，可空值用 null 类型。支持的有界子集为 type、properties、required、additionalProperties、items、enum、const、anyOf、description、title、minimum、maximum、minLength、maxLength、minItems、maxItems；未知关键字、过深结构和不能映射的原生约束在接收前拒绝。首版 methodRefs 仅接受空列表，选定的方法正文请明确作为 text 输入；不自动运行 KSF 入口或能力路由。

成功输出先保存结果文件，再保存任务聚合。`get` 返回有界 inline value 与结果摘要；`readResult` 再核对已保存结果的身份和摘要。失败候选不会作为成功输出供应用采用。

## 管理与恢复

管理接口全部为会话保护的 POST：

| 路径 | 请求 | 作用 |
| --- | --- | --- |
| /api/ai/inspect | {} | 最近 100 个任务、配置和应用后台启动错误 |
| /api/ai/config | {kind:"connections" 或 "profiles"} | 读配置及全局 revision |
| /api/ai/config | {kind,config:{revision,items}} | 乐观校验后更新整类配置 |
| /api/ai/check | {executorId} | 本地连接及认证引用检查，明确返回检查范围 |
| /api/ai/task | {aiTaskId} | 按编号读取历史任务，不限于最近列表 |

任务重试只用于已知可安全重试的限流或输出修复，保留任务编号并创建新 attempt。API HTTP 5xx、发送后网络断线及未完整取得响应均保守进入 reconciling。OpenAI Responses 使用 store:false；DeepSeek Responses 按其官方无状态协议提交，不添加未声明的 store/strict 字段，默认 reasoning.effort 为 none，显式 minimal/medium 分别映射为 low/high。两路线均只取最终文本并统一校验，不保存推理过程；没有可查询的持久上游结果时，不具备自动 API 对账能力。取消仍未确认停止的执行后，原并发额度继续占用；不能通过改状态假装远端已停止。

CLI 使用监督 worker、独立临时工作目录、只读沙箱、stdin 指令、JSONL 与最终消息文件。不继承桌面聊天身份；禁用用户配置、规则、插件、hooks、shell、浏览器和多 Agent 等额外工具入口，仅支持文本整理。进程停止使用当前 worker 持有的 child handle/process group；恢复时只核对带 task/attempt 身份的回执，不根据历史 PID 杀进程。原始事件、stderr、reasoning 与工具日志不持久保存。

每根由单写者持有 writer.lock。启动时验证任务版本、请求摘要、事件序列和成功结果；运行中任务先进入 reconciling，不批量重排队。CLI worker 在服务断开后停止其子进程并保存回执；恢复后按回执结束原 attempt。损坏记录、未知版本、归属不明的锁保留并报错。文件/目录同步与原子替换已经实现；真实断电、Windows 文件系统和长期运行尚未实测。

用量只返回本次成功执行能够取得的来源数据；费用未知为 null，不承诺覆盖所有失败或重试的账单。

首版尚无 API 远端查询或人工结算回填入口。结果未知时，界面可读取诊断和取消，但取消不会释放未确认停止的执行额度；不要改动任务文件来绕过该约束。CLI 已实现监督回执对账，API 对账扩展仍需供应商可验证的依据。

## 应用后台入口

需要无窗口运行的 SDK v2 应用可以显式声明 `background:true`，同时在 permissions 列出 `background`，后端返回 `startBackground()`。工作台启动、安装/启用后会启动此入口；`dispose()` 应停止计时器。后台保留与 tasks.run 的短期保活分别管理，不用永久任务阻塞更新。后台不能自行越过在途调用/操作的排空条件。

应用的日期、时区、定时、补跑、业务状态和发布回执仍由应用代码保存。Core 不解释“早会”“日刊”或业务 DAG。机器离线不承诺准点，具体补跑/截止策略由应用实现。

## 验证与交付边界

已提供公共核心、适配器、进程故障、服务桥和后台生命周期测试；真实 Codex 及安装应用的真实调用单独运行显式脚本，使用虚构材料。真实 DeepSeek API 需要后台凭据，真实音频需要单独的转写供应商与配置。用户已确定早会当前只做本地核对导出，团队文档/发送后续接；早读来源、时间和定时启用由独立应用配置；后续真实业务验证由所在项目记录，不从公共 AI 服务推定配置已就绪。两个业务应用在独立工程中交付，不随 Core 自动安装；本轮没有公开发行。

DeepSeek 协议和默认模型核对依据为 2026-10-27 实际读取的 [Responses 官方接口](https://api-docs.deepseek.com/api/create-response/)与[官方接入说明](https://api-docs.deepseek.com/quick_start/pricing)。8 项专项测试使用模拟响应，不能替代真实账户成功证据。
