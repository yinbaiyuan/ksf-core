# ksf-core

`ksf-core` 承接 KSF 系统，是唯一系统开发源；`ksf-workspace` 承接 KSF 用户模板；从模板复制或创建的实际用户实例默认命名为 `ksf`，也可以使用用户自定义的目录名和仓库名。

`.agents/ksf` 与 `.agents/ksf.ps1` 保存固定启动与恢复入口，`.agents/core/` 保存可升级的系统定义、程序、文档、测试和模板源；`.agents/runtime-data/` 保存本机缓存、升级备份和贡献草稿，不入库。

Core 源码仓库不保留项目、知识、用户能力、收件箱、源档或归档目录。构建 `ksf-workspace` 模板时，发行程序自动生成空的用户目录；测试数据使用临时目录。

普通使用者可以从 [ksf-workspace 用户模板](https://github.com/yinbaiyuan/ksf-workspace) 创建名为 `ksf` 或自定义名称的私有仓库，也可以下载 [Release](https://github.com/yinbaiyuan/ksf-core/releases) 中的 `ksf-workspace-<版本>-<平台>.tar.gz`，解压后按自己的名称保存为用户实例。无需 Git、全局 Node.js、Python 或 npm。当前构建目标为 macOS ARM64 与 Windows x64，使用随包 Node.js LTS；各项原生验证范围以对应验证说明为准。

系统通过 Release 版本和文件基线升级，不合并用户仓库。个人数据归用户工作区所有；公开贡献从选定系统差异建立新的 Core 提交，用户的私人 Git 历史不进入贡献分支。

开发验证：

```sh
.agents/ksf runtime verify --json
.agents/ksf test
.agents/ksf release build --dry-run --json
```

官方发行要求干净的源码提交。设置 `.agents/core/build.json` 的版本，提交并推送 `v<版本>` 标签后，GitHub Actions 验证、打包并发布 `ksf-core` 系统包、`ksf-workspace` 模板包和 `ksf-core-release.json` 索引。Core Actions 随后用同一批产物直接同步官方 `ksf-workspace`，模板不再运行定时自同步。用户实例也可显式发起远程 Actions，无需本地 Core 克隆；跨仓库 App 配置、template-only 恢复与两阶段结果见[发行说明](.agents/core/docs/distribution.md#从用户实例发起远程发行)。

主分支为 `main`，功能和修复分支按用途命名，无需 `ksf-` 前缀。正式使用和系统开发分别保存到各自仓库，详见 [Git 协作规则](.agents/core/docs/git.md)。

说明入口：[发行与升级机制](.agents/core/docs/distribution.md)、[CLI 能力说明](.agents/core/docs/cli/overview.md)。
