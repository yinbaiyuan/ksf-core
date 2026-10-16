# runtime 命令说明

设计与后续扩展统一遵循 [CLI 命令设计规范](../CLI命令设计规范.md)。已实现行为与待实现接口分别标注。

## 状态与职责

已实现顶级入口，目前仅提供 `verify` 子命令，用于完整验证随包压缩包与已安装 Node。普通启动准备由启动层自动执行，不是另一条 `runtime` 子命令。

## 调用

```sh
.agents/bin/ksf runtime verify
.agents/bin/ksf runtime verify --json
```

当前不支持单独的 `runtime`、安装、升级、卸载、清理或版本切换子命令。

## 行为与文件影响

完整校验计算压缩包与 Node 的 SHA256，并检查 Node 的精确版本。已安装 Node 损坏时可从匹配的随包压缩包重新准备；压缩包缺失或不匹配时报错。即使已有可用安装，也不跳过显式完整校验。

可能更新 `.agents/runtime-data/runtime/` 中的安装记录、Node 安装、锁和临时目录。不下载运行时、不改用全局 Node、不修改构建配置或 manifest。普通启动快检与本命令的完整校验不同。

## 输出与错误

普通成功输出为 `KSF runtime verified.`。JSON 包含 `ok: true`、`command: "runtime verify"` 及 `runtime`；运行信息字段为 `nodeVersion`、`nodePath`、`ksfRoot`。

成功退出码为 0，参数错误为 2。启动或校验失败会非零退出；即使带 `--json`，启动层错误也可能是 stderr 中的纯文本。直接运行 JavaScript 而未经过入口校验时，CLI 返回 `BOOTSTRAP_REQUIRED`，不能据此绕过启动程序。

## 实现与验证来源

具体安装身份、锁、修复、平台范围与清单格式见 [bootstrap](../../runtime/bootstrap.md)，源码为 [bootstrap.sh](../../runtime/bootstrap.sh)，覆盖案例见[启动测试](../../runtime/tests/bootstrap.test.js)。

本文说明当前实现，不宣称本轮重新执行了完整校验。返回[索引](index.md)。
