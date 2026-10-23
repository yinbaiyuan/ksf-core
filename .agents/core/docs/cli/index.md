# CLI 命令文档索引

命令设计遵循[统一规范](../CLI命令设计规范.md)，可执行能力总入口见 [CLI 能力说明](overview.md)。各文档明确区分已实现与设计中。

程序分层、启动调用链、数据目录和维护入口见[系统基础架构](../system/README.md)。本目录继续持有各命令的具体接口契约。

## 已实现命令

| 命令 | 职责 | 文档 |
| --- | --- | --- |
| launcher recover | 无需 Core/Node 恢复中断升级 | [启动入口](../../runtime/launcher.md) |
| hello | 检查启动与输出链路 | [hello](hello.md) |
| runtime | 运行时完整校验 | [runtime](runtime.md) |
| build | 校验构建输入并生成 manifest | [build](build.md) |
| test | 随包 Node 执行 JavaScript 测试 | [test](test.md) |
| eval | 独立Agent自然语言三路由批测、证据与评审 | [eval](eval.md) |
| user-data | 系统设置、本地身份、能力源关联及对象配置／必要状态 | [user-data](user-data.md) |
| metadata | 任意 Markdown frontmatter 管理 | [metadata](metadata.md) |
| context | 组织 Agent 所需的能力发现上下文 | [context](context.md) |
| project | 项目根卡与目录的基础管理 | [project](project.md) |
| repository | 本地独立 Git 工程创建、项目关联与检查 | [repository](repository.md) |
| release | 发行构建、发布和官方模板镜像 | [release](release.md) |
| system | 工作区版本检查、升级、恢复和回滚 | [system](system.md) |
| contribute | HEAD 已提交系统修改的审查与 Core PR | [contribute](contribute.md) |
| commit-message | 提交信息格式检查与填写模板 | [commit-message](commit-message.md) |
| pr-description | PR 标题、正文格式检查与模板 | [pr-description](pr-description.md) |
| workflow | 工作流对象管理 | [workflow](workflow.md) |
| partner | 搭档对象管理 | [partner](partner.md) |
| competency | 基本功对象管理 | [competency](competency.md) |
| data-package | 数据包对象管理 | [data-package](data-package.md) |
| 无参数、--help、-h | 帮助选项 | [help](help.md) |

四类对象共用 list/read/write/remove/check，完整参数、输出、目录派生、用户接管、版本解析、发布与异常规则集中维护在[对象命令公共规则](objects.md)，各类型文档补充具体入口与边界。公共字段以[对象元数据规范](../对象元数据规范.md)为准，不重复维护字段契约。

CLI 适配、对象服务、目录/契约/解析/发布模块分开。对象层复用 metadata 底层，不启动其他 CLI 子进程共享业务逻辑；metadata 自身不承担对象生命周期规则。

## 能力源

[source](source.md) 管理独立 Git 能力源的声明、直接关联、多源检查与个人对象贡献导出；Git 更新、提交和 PR 按正常仓库流程执行。

## 后续能力

`context capabilities` 复用对象服务，一次提供完整有效的工作流和搭档摘要；项目基础命令已实现，其他上下文操作以及知识和任务命令尚未形成确定接口。

## 调用与维护

Core 开发仓库与发行工作区在 macOS 调用 `.agents/ksf`，Windows 对应 `.agents/ksf.ps1`（目前仅入口恢复与转交契约）；其他 cwd 使用入口绝对路径。没有默认安装全局别名。普通路径基于入口定位的 KSF 根。固定入口先恢复已发起的中断事务；启动和普通命令不检查或安装新版本，维护命令只显式调用，详见 system。

共同启动可能准备 `.agents/runtime-data/runtime/`，因此命令自身只读或预览不代表整个启动过程零写入。新增或变更接口时同步对应文档、公共规范、索引和能力说明，并运行相应回归、构建及真实入口验证。通过检查不代表获准提交或发布 Git。
