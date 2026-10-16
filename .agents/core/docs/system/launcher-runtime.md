# 启动器与运行时

固定入口负责在 Core 不完整时仍能恢复系统；Core bootstrap 负责准备指定运行时；Node 执行 JavaScript CLI。三层各自升级和处理故障，精确转交与事务协议见[固定入口契约](../../runtime/launcher.md)，安装算法见 [bootstrap](../../runtime/bootstrap.md)。返回[架构总览](README.md)。

## 一次调用经过什么

以在 KSF 根执行 `.agents/ksf user-data read settings --json` 为例：

1. Shell 入口从自身位置解析 KSF 根，检查关键路径，检查是否存在已公布的升级事务。
2. 有事务时先核对 owner 的 PID 与启动身份。活跃事务返回占用；已中断事务按恢复协议处理。恢复完成或没有事务时继续。
3. `launcher recover` 在这里结束；其他命令准备本机运行目录及其忽略文件，设置入口协议环境，加载当前 Core 的 bootstrap。
4. bootstrap 从 manifest 解析精确 Node 版本、平台、压缩包与可执行文件摘要，确定本机安装身份。
5. 检查安装记录，必要时加锁、核验或重新安装；准备成功后用该 Node 执行 cli.js，原参数继续传入命令层。

根目录不依赖调用者 cwd。跨目录调用应使用当前根入口的绝对路径。环境中的 `KSF_ROOT` 不能替调用者选择另一套 Core；以入口实际定位结果为准。

## 固定入口的修改边界

[Shell 入口](../../../../.agents/ksf)与 [PowerShell 入口](../../../../.agents/ksf.ps1)位于 `.agents/core/` 外，恢复逻辑不依赖 Core、Node、Git 或网络。入口协议由 [products.js](../../runtime/src/distribution/products.js)与原生入口共同约定；不能只修改其中一端。

入口向 Core 传递 `KSF_ROOT`、`KSF_INSTALLED_LAUNCHER=1`、`KSF_LAUNCHER_PROTOCOL=1`。Core 定义 `ksf_bootstrap_main`：Shell 最终 exec Node；PowerShell 以参数数组调用函数，并返回 LASTEXITCODE。业务规则、settings 消费、发行源选择及 Node 安装算法由 Core 持有。

入口内容和权限不变时，普通升级保留原文件。入口需要修复时仍可随发行更新：事务生产端必须保存变化根文件的前后快照和替换意图，恢复端必须理解相同协议。未知协议或并发编辑返回错误并保留现场。

## Node 准备与复用

随包压缩包属于 `core/runtime/packages/`；解压后的安装属于 `runtime-data/runtime/`。安装身份由版本、平台与压缩包 SHA256 组成，同版本不同压缩包也对应不同身份。

普通启动检查安装记录、文件存在性、权限和文件属性，不逐次对整个压缩包或 Node 计算摘要。需要重新核验时，在身份锁内再次检查；可执行文件摘要与版本正确时可刷新记录，确有缺失或损坏时才从随包压缩包准备。

安装先校验压缩包和所需普通文件条目，只提取 `bin/node` 与 LICENSE；执行候选 Node 前先核对可执行文件摘要，再核对精确版本。完成安装记录后在同一文件系统公布目录。失败保留可诊断材料或恢复原安装，不静默选择其他 Node 身份。

显式完整校验使用：

```sh
.agents/ksf runtime verify --json
```

该命令会校验压缩包及已安装 Node，可能修复安装或更新记录。它不下载运行时，也不选择全局 Node。旧的健康安装身份会保留；切回相应版本时可以复用。清理条件见[本机运行数据](runtime-data.md)。

`build` 是特殊准备路径：bootstrap 使用原生工具读取 build.json 中的固定输入，避免必须先有正确 manifest 才能重建 manifest。生成机制见[生命周期](lifecycle.md)。

## 输出、失败和平台

启动诊断写 stderr，Core 持有正常业务 stdout。`--json` 是 Core 命令选项，启动层失败仍可能返回纯文本诊断。独立恢复成功退出 0，launcher 参数错误退出 2，路径、锁、事务或 bootstrap 错误退出 1。普通命令的退出码由 Core 转交。

排查顺序是：确认调用的是哪一个根入口 → 查看 stderr → 判断问题发生在恢复、bootstrap、Node 准备还是业务命令。活动事务、未知协议、根文件恢复冲突和缺失 bootstrap 不能当成业务命令返回空数据。

| 平台 | 当前状态 |
| --- | --- |
| macOS ARM64 | 已随包提供 Node，支持现有完整启动链 |
| macOS x64 | 有平台识别和构建描述能力，尚无对应随包运行时 |
| Windows | PowerShell 5.1 入口已实现独立恢复、路径检查、参数及退出码转交契约；bootstrap.ps1、Windows Node 包与业务 CLI 尚未接入 |
| Linux | 当前未支持；Shell 恢复与安装锁依赖 macOS 原生工具 |

Windows 原生恢复示例：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .agents/ksf.ps1 launcher recover
```

该操作会按已发起事务恢复或完成归档；没有事务时不恢复任何版本。执行策略参数只作用于本次进程，组织策略仍可能限制执行。恢复成功不能证明 Windows 业务 CLI 可用。

## 维护与验证

修改原生入口，需同时核对两平台参数传递、退出码、无 Core 恢复、活跃事务、协议拒绝、根文件冲突和入口自身替换；修改 bootstrap，需核对快检、完整校验、安装并发、损坏修复与中断清理。发布前实际平台验证应与本机模拟结果分开。

源码：[bootstrap.sh](../../runtime/bootstrap.sh)、[事务生产端 system.js](../../runtime/src/distribution/system.js)。测试：[launcher.test.js](../../runtime/tests/launcher.test.js)、[bootstrap.test.js](../../runtime/tests/bootstrap.test.js)、[system-update.test.js](../../runtime/tests/system-update.test.js)、[Windows PowerShell 测试](../../runtime/tests/launcher-windows.ps1)。Windows CI 配置保存在 Core 开发仓库的 `.github/workflows/check.yml`，不随用户实例分发；macOS 上执行 PowerShell 测试不等于 Windows 实机通过。
