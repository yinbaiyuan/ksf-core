# KSF 完整系统文档

KSF 以人为主体，把认知与资产、可复用的 AI 能力、实际工作和对外协作连接起来。先从一项真实工作开始，按需要理解和使用各部分。

本文档随当前 Core 分发。系统版本以构建及发行凭据为准；实现、测试、本机安装、公开发行和业务验收分别记录。[版本与支持](reference/compatibility.md)说明当前边界。

## 选择阅读路线

| 阅读路线 | 起点 | 完成后能够做什么 |
| --- | --- | --- |
| 理解 KSF | [总论与立字模型](handbook/overview.md) | 理解价值、组成、责任和飞轮 |
| 使用 KSF | [首次使用](handbook/getting-started.md)、[第一项工作](handbook/first-task.md) | 配置必要信息，产出并接续工作 |
| 开发应用与能力 | [能力体系](handbook/abilities.md)、[应用开发者手册](app-development/README.md) | 设计能力、按SDK契约开发和交付应用 |
| 理解系统机制 | [完整调用链](handbook/architecture.md)、[系统架构](system/README.md) | 理解Agent、CLI、进程、状态和数据的连接 |
| 维护与排障 | [日常维护](operations/daily.md)、[故障处理](operations/troubleshooting.md) | 核对运行状态，管理升级及恢复现场 |

## 常用入口

- [身份和配置](handbook/identity-configuration.md)：用户、实例、设备分别是谁。
- [认知与资产](handbook/assets.md)：内容放在哪里，如何保留来源。
- [任务推进与恢复](handbook/task-execution.md)：一项请求怎样成为可核验结果。
- [工作台与应用](handbook/workbench.md)：窗口、卡片、后台和安装更新。
- [AI三条交互路径](handbook/ai.md)、[跨实例协作](handbook/collaboration.md)。
- [术语](reference/glossary.md)、[数据地图](reference/data-map.md)、[CLI索引](cli/index.md)。
- [开发与测试规范](testing.md)：本地、CI、发行的验证范围、选测和证据规则。

## 怎样阅读和使用

操作指南提供目标、前提、步骤、核验与失败处理；接口参考说明字段、错误和副作用。遇到冲突回到负责该规则的现行契约，并核对实际命令，不从旧截图猜测当前界面。

示例中的项目、文本和编号均为演示；占位值必须替换为实际读取结果。写入、发送、模型执行、服务停止和升级会产生实际影响，先在隔离环境练习。本文不授权执行页面中的任何命令。

工作台内打开“KSF手册”可离线阅读、全文搜索、跳转章节和复制链接。[阅读器说明](handbook/documentation-reader.md)介绍入口和故障处理。Markdown正文是唯一维护源，目录和搜索索引由工具生成。

## 文档维护

编写、版本、示例及校验要求见[文档维护规则](reference/documentation-maintenance.md)。历史设计、专项验收与当前操作说明各自保留性质；完整实现不能由一篇文档或一次测试证明。
