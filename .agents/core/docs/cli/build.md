# build 命令说明

设计与后续扩展统一遵循 [CLI 命令设计规范](../CLI命令设计规范.md)。已实现行为与待实现接口分别标注。

## 状态与职责

已实现。校验构建配置和随包资产，生成 KSF 运行声明及构建元数据。当前 build 不编译 Node，也不打包完整发行版、下载升级或发布 Git 内容。

## 调用与输入

```sh
.agents/ksf build
.agents/ksf build --json
```

输入为 [build.json](../../build.json)、配置声明的运行时包及系统源码；输出固定为 [manifest.yaml](../../manifest.yaml)。当前不支持自定义输出路径或自动递增版本。

build 使用独立构建输入启动，能在 manifest 缺失或损坏时重建。版本与可信包声明由构建输入明确指定，Agent 不手填生成字段。

## 行为与文件影响

验证所有声明的平台包，计算包与可执行文件校验值、系统源码摘要及构建元数据；检查输入在构建期间未变化后，原子替换 manifest。失败保留旧 manifest。

启动准备可能先安装配置指定的 Node；最终 manifest 发布失败不等于启动准备没有文件影响。系统源码摘要包括 `.agents/core/` 与根 `AGENTS.md`，不把用户知识、项目和运行数据纳入系统源码摘要。详细排除规则以生成器为准。

## 输出与错误

普通成功输出生成文件位置。JSON 包含 `ok`、`command: "build"`、`manifestPath` 和完整 `manifest`。

成功退出码为 0，JavaScript 构建失败为 1，参数错误为 2。构建错误可以通过 JSON 输出到 stderr；更早的启动层错误仍可能为纯文本。失败不能当作已更新运行声明。

## 实现与验证来源

- [构建机制与字段来源](../../runtime/build.md)
- [生成器](../../runtime/src/services/build-manifest.js)
- [构建测试](../../runtime/tests/build.test.js)

本文依据当前实现整理，不代表本轮已重新构建或验证发行资产。返回[索引](index.md)。
