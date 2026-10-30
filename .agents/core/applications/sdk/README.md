# KSF 应用 SDK 1.0.0 开发版

全新宿主协议为 SDK v1；schemaVersion 与 sdkVersion 均为 1，全部应用按新清单重建，尚未正式发行。完整开发规范与AI开发入口统一在[应用开发者手册](../../docs/app-development/README.md)，请先读[AI-START](../../docs/app-development/AI-START.md)。

本目录提供公共类型、React适配、文件/AI客户端、JSON持久化、五个模板及ksf-app create/check/build。普通应用的模型执行统一经过宿主AI服务；应用不保存模型密钥或自行启动模型CLI。

应用 ID 必须是 `com.<发布者>.<应用名>` 三段式，如 `com.yinbaiyuan.camp-tasks`；后两段使用小写字母开头的小写字母、数字及段内连字符，总长不超过80。卡片短 ID 独立校验。新模板要求 Core 0.3.2；清单/运行协议仍为1，SDK仍为1.0.0。既有安装的身份迁移须使用配套工具，不能直接改包内manifest或移动单一数据目录，见[发布与迁移](../../docs/app-development/release.md)。

```sh
npm ci --ignore-scripts
node scripts/ksf-app.mjs create ../my-app --template window
```

新应用只依赖手册列出的公共入口，不能依赖Core私有源码。server/protocol.js是应用协议维护源，scripts/sync-protocol.mjs生成独立运行时副本，--check用于CI。运行时不从SDK源码动态读取后端；发布产物包含完整依赖。

本SDK仍面向已确认的受信任代码。能力声明不是沙箱，支持及验收范围见开发手册。

`protocol:check` 与 `scripts/sync-protocol.mjs` 仅供 Core 维护者生成/核对运行时副本；独立开发包不包含该副本，应用开发只需 create/check/build 与模板验收，不执行该维护脚本。

商店图标、截图和更新说明见[展示资料规范](../../docs/app-development/store-listing.md)。可使用 `ksf-app build . --listing-only --store ../store` 独立更新已构建版本的介绍，无需重打包。

新增接口见[应用包内 CLI](../../docs/app-development/cli.md)与[通信、后台和工作流](../../docs/app-development/communication.md)。新建 --template collaboration 可获得包内 CLI 与消息激活的独立工作流示例；任务、等待和审批状态均由应用保存。

生命周期、纯后台与运行管理见[生命周期](../../docs/app-development/lifecycle.md)和[后台服务](../../docs/runtime/service.md)。

应用菜单与设置入口见[窗口与交互](../../docs/app-development/windows.md#应用名称菜单与设置入口)。SDK 支持菜单注册、动态更新、注销与点击回调；菜单展示在整个工作台顶部，跟随活动窗口，设置界面和数据仍归应用管理。

最低 Core 通过必填minCoreVersion声明；dataStores声明受管JSON，空数组表示无受管数据。数据迁移必须在受限prepareData阶段显式进行，read保持只读。完整接口、原件副本与回退限制见[后端数据](../../docs/app-development/backend-data.md)。
## 运行监控补充

`@ksf/sdk/runtime-monitor` 提供 `createRuntimeMonitorClient(sdk)`，通过 `runtime-monitor-v1` 宿主能力与 `runtime.read`／`runtime.manage` 声明读取受管任务、应用、资源、日志并执行受版本保护的控制。后台任务可使用 `context.tasks.run(action, {name, cancellable:true})` 并在回调中消费 `AbortSignal`；旧的无参数回调继续兼容。详见 [监控接口说明](../../docs/runtime/activity-monitor.md)。

声明 manifest.cli 即自动获得商店“支持 CLI”标识及窗口应用名称菜单中“关于”后的固定“CLI 文档”。无需注册开关或自定义菜单，开发者不能覆盖标准项。纯后台、仅卡片及停用应用从商店详情阅读当前安装包。主文档必须非空、有效 UTF-8 且 ≤256 KiB，打包与宿主安装共用校验。阅读不会执行 CLI 或启动后端，具体版本与包内链接限制见 [CLI 文档标准](../../docs/app-development/cli.md#商店标识与标准文档入口)。

## 应用工作流与合作结果

Core 0.3.5 提供 `@ksf/sdk/workflows`：业务应用声明工作流提供能力及 cooperation.request 权限，先保存等待点，再发出合作任务；结果通过宿主绑定的 workflow.signal 送回原运行。流程节点和恢复属于应用。使用 `ksf-app create <目录> --template workflow-provider` 生成可运行示例；详见[工作流契约](../../docs/app-development/workflows.md)与[示例说明](templates/workflow-provider/README.md)。
