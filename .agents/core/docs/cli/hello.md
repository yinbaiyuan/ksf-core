# hello 命令说明

设计与后续扩展统一遵循 [CLI 命令设计规范](../CLI命令设计规范.md)。已实现行为与待实现接口分别标注。

## 状态与职责

已实现。输出问候及当前运行信息，用于检查程序入口、随包 Node 和 JavaScript CLI 的调用链，不执行能力发现或任务路由。

## 调用

```sh
.agents/ksf hello
.agents/ksf hello --json
```

仅接受上述两种形式，不接受重复选项、额外参数或自定义问候内容。

## 输出与影响

普通输出为 `Hello, KSF!`。JSON 包含 `ok: true`、`command: "hello"`、`message` 和 `runtime`。`runtime` 包含当前 `nodeVersion`、实际执行的 `nodePath` 和 `ksfRoot`。系统版本读取 manifest，当前 hello 不返回该字段。

命令自身不写文件；启动准备可能安装或修复本机运行时。成功退出码为 0；CLI 参数错误为 2；启动失败由启动层报告。成功结果进入 stdout，错误进入 stderr。

成功只说明本次调用链和输出成功，不代表压缩包已经完整复验、业务能力已实现或其他平台可运行。

## 实现与验证来源

- [hello 服务](../../runtime/src/services/hello.js)
- [CLI 分发](../../runtime/src/cli.js)
- [启动测试](../../runtime/tests/bootstrap.test.js)
- [调用字段与共同错误说明](overview.md)

本文依据源码整理，不代表本轮重新执行了命令或测试。返回[索引](index.md)。
