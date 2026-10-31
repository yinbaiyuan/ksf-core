# 工作流提供与合作回调示例

这是应用自行管理流程的最小可运行示例，需要 Core 0.3.5、SDK v1 和合作中心 0.4.0。无真实凭据、模型调用或外部业务接口。模板生成后请替换 com.example.workflow-provider 应用身份。

## B：让声明启动新运行

构建、导入并启用此应用，在合作中心“我的承接声明”中新增声明，处理方式选择“运行工作流”，再选择“文本整理示例”。目标和文本材料默认传入；补充文本材料、输出风格、是否本机人工复核可以开放给 A，也可以固定在 B 本机。成果说明映射 summary，成果文件映射 materials。

A 选择该声明发送任务。示例将目标与材料整理成 Markdown 成果。humanReview=true 时等待 B 打开对应运行，在有效窗口确认具体 revision。流程 ready 后，合作中心再依声明自动提交或等待 B 确认提交。

## A：原流程等待合作结果

使用随包应用 CLI，命令采用 `{operationId,params}` 信封。先 run.create 获取 runId，再 run.request：

```json
{"operationId":"a-stable-uuid","params":{"runId":"已保存的运行编号","waitId":"稳定等待点编号","taskId":"预生成任务编号","peerId":"已配对实例nodeId","goal":"整理资料","offerId":"manual","offerRevision":1}}
```

run.request 先持久保存自己的等待点和任务编号，然后调用宿主 cooperation.request。失败或未知时按相同编号和参数核对；不要重建请求。一个运行可使用不同 waitId 并行发多个任务。run.get 读取状态，run.pause 暂停，run.resume 消费暂停期间已收到的结果。完成、拒绝、取消分别写入对应等待点 outcome。

workflow.signal 将事件与原等待点推进放在同一 SQLite 事务中。接管回执丢失后，重复事件只返回确认。结果材料已由宿主按摘要转入本应用材料目录。此示例不把收到结果当作允许执行新命令，真实应用应继续使用自身授权。

## 存储与验证

运行、等待点、事件和操作保存在 dataDirectory/workflow.sqlite，材料位于 materials/<sha256>；后端不依赖窗口保持打开。业务代码位于 backend.mjs，窗口仅呈现和人工确认。SDK/宿主接口见[工作流契约](../../../../docs/app-development/workflows.md)。

隔离双实例测试位于 Core applications/cooperation-center/tests/workflows.test.mjs，覆盖真实后台进程和 mTLS 通信、乱序结果、暂停、回执丢失重启、人工复核及失效运行。测试中的 API/CLI 执行器是合成适配器，需要另做实际模型验收。

测试遵循 SDK 开发手册中的统一测试规范（docs/testing.md）。第一方应用的自有测试必须登记到 Core 测试清单；独立应用保留自己的测试入口。测试装置放在 tests/，生产入口不得导入测试代码。
