# 数据地图与所有权

路径以实例根为基准。缺失的按需目录可以正常不存在。目录名称只是入口，备份、迁移和清理必须按实际模块判断。

| 内容与位置 | 权威所有者 | 生命周期／恢复要点 |
| --- | --- | --- |
| .agents/core/、AGENTS及固定启动器 | 系统发行与本地开发 | 核对版本、来源、摘要；升级按事务，不带私人正文 |
| USER.md、BOT.md | 用户 | 稳定设定原文，升级不覆盖，按明确授权维护 |
| 项目/、知识/、能力/、档案/、收件箱 | 用户 | 原件、正式正文及历史需备份，源引用保持可追溯 |
| repositories/及外部工程 | 各独立工程 | 自己的Git和未提交内容，父实例Git不备份它们 |
| 外部能力源仓库 | 源仓库及用户关联 | 当前工作树生效，关联只记录位置，不包含正文快照 |
| .agents/user-data的实例及对象命名空间 | 对应配置服务 | 保存覆盖值和版本，损坏或未知格式保留原件 |
| user-data/applications/state.json | 应用安装服务 | active/pending/previous、来源与开关需配套核对 |
| user-data/applications/data/应用ID/ | 应用 | 用户业务数据，按清单schema准备和迁移 |
| runtime-data/applications/data/应用ID/ | 应用 | 本机持久数据，Git忽略不等于可丢弃 |
| user-data/ai/ | AI服务 | 配置、任务、材料与结果；未知执行和成功结果需原ID核对 |
| user-data/codex-conversations/ | 会话服务 | 原生线程关联与操作回执，不保存另一份完整正文 |
| user-data/communication/ | 通信服务 | 配对身份、信任、消息及操作等按实际契约保存 |
| runtime-data/communication/ | 通信本机运行支持 | 设备名称、控制及端点等按模块清点，不能整体克隆 |
| 档案/对话/宿主/ | task采集 | 实际消息与路由原件，摘要可重建不等于原件可删 |
| user-data/chats/ | chat服务 | 当前聊天变量与能力参与状态，和档案正文分开 |
| runtime-data/routing/v1/identity.key | 本机匿名身份服务 | 与现有聊天档案身份关联，不能随意换钥或分离清理 |
| runtime-data/task-capture/ | 对话采集器 | 开关、基线、游标和锁；重新启用不补采停用轮次 |
| runtime-data/service/、web/control.json | 主服务 | 本机策略、锁、PID、身份和日志；活状态不能直接恢复复制 |
| runtime-data/system/ | 升级与恢复服务 | 事务、失败现场、系统备份，先核对是否仍需恢复 |
| runtime-data/runtime/ | bootstrap | 随包Node安装可重建，仍需核对进程及旧版回退依赖 |
| docs/catalog.json | 文档生成工具 | 可由唯一正文和导航重建，带摘要，不能成为另一份手写规则 |

表中的user-data/和runtime-data/均位于.agents/下。消息、材料、密钥的精确子目录以所属协议和实际返回路径为准，不据本表手动重排。

## 保存与清理规则

- 原件、已提交消息、成功结果和必要身份不能按缓存超时清除。
- 锁、PID和控制令牌属于活动进程协调，先核实写入者与事务，不从历史PID盲杀。
- 配置导出、Core回滚、应用迁移原件保护和完整备份分别覆盖不同内容。
- 外层Git忽略、网盘排除、权限保护和密钥保管是不同机制。
- 单文件原子写入和CAS不构成任意跨文件或跨设备事务。

格式兼容以[Core声明](../runtime/data-compatibility.md)与应用dataStores为准。可执行恢复步骤见[备份迁移](../operations/backup-migration.md)，具体运行目录见[本机运行数据](../system/runtime-data.md)。
