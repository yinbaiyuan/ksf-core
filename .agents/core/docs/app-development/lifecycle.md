# 应用生命周期：SDK v1

SDK 包为 `@ksf/sdk@1.0.0`，清单统一使用 `schemaVersion:1`、`sdkVersion:1`。公共类型为 ApplicationSDK、ApplicationManifest、ApplicationBackendContext。窗口、卡片、CLI、存储、AI、通信与后台任务属于同一完整契约，没有按历史版本区分的功能分支。

## 界面与后台分别声明

有界面的应用通过 window/cards 声明入口；无后台时不创建 Node 子进程。有后台的应用必须显式声明：

```json
{
  "schemaVersion": 1,
  "sdkVersion": 1,
  "minCoreVersion": "0.3.0",
  "dataStores": [],
  "id": "com.example.worker",
  "name": "后台工作示例",
  "description": "按需处理任务",
  "version": "1.0.0",
  "backend": {
    "runtime": "node",
    "entry": "backend/index.mjs",
    "lifecycle": "on-demand"
  },
  "permissions": []
}
```

`on-demand` 由窗口/卡片、CLI、已授权消息激活；没有调用、客户端、任务和保活需求时退出。`resident` 随主服务启动，要求 background 权限及 startBackground() 入口。两种模式都可以不提供界面。终端等应用按窗口租约管理资源；关闭一个窗口不影响其他窗口。

后端导出 activate(context)，返回 call、startBackground、onMessage、dispose 等所需方法。纯后台应用可只提供 startBackground 与 dispose。服务无需等用户打开窗口才工作。

## 在途工作与恢复

- `context.tasks.run(action)` 在 action 结束前持有任务租约，适合本进程内在途工作。
- `context.background.retain({key,reason})` 保存跨后台重启的运行需求；业务完成后 release(key)。需要 background 权限。`background.list()` 直接返回 `{key:{reason}}` 映射，不额外包装 holds 字段。宿主恢复时调用 startBackground()，业务步骤与恢复由应用负责。
- CLI 与消息处理持有真实调用租约；超时结果未知时，原工作仍保留租约，不自动重复执行。
- 应用显式停止后，新激活被拒绝，start/restart 才恢复。后台调用不能撤销用户停止或商店停用。

不要只在前端 useEffect/定时器内启动需要长期执行的工作。定时调度、等待、任务状态和幂等回执应由应用后台持有；宿主负责进程与租约，不接管业务工作流。

## 构建

`ksf-app create <目录> --template service` 创建纯后台示例。也提供 window、cards、ai-task、collaboration 模板。没有界面入口时跳过前端工具链与构建，只打包所需后端和 CLI/文档资源。

旧 frontend、background 和旧 SDK 类型不再支持；旧包即使编号也是 1，也必须满足完整新清单结构。全部应用同步重建，宿主不做旧字段映射。

运行与诊断见[后台服务](../runtime/service.md)。

## 数据准备先于激活

启动顺序为兼容预检 → 导入后端 → `prepareData(context)` → 全量受管文件就绪核验 → `activate(context)` / `startBackground()` → 接收窗口、卡片、CLI及消息调用。准备上下文类型为 `ApplicationDataContext`，只包含 sdkVersion、appId、version、storage、locks。宿主拒绝准备阶段的普通 write、AI、网络消息、业务服务及后台保活请求；Node 后端本身仍是可信本机代码，此约束不是系统沙箱。

准备独立限时30秒，激活仍限时10秒。数据错误和准备超时停放该包，诊断保留错误码；不自动循环执行迁移。用户修复后执行 `app runtime start <id>` 可重试；升级到新摘要也可重新准备。其他应用继续工作。宿主已经开始的文件操作不会随子进程超时丢弃，完成前阻挡版本切换。

多文件逐个准备；前一个已成功、后一个失败时，应用保持未就绪。重试先 inspect 当前版本，已完成文件跳过，其余继续；不回滚前一个文件。跨文件业务事务由应用设计。
