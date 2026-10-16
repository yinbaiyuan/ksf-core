# CLI 分层与扩展

CLI 把宿主传入的命令变成确定性的查询或修改，并返回调用者可判断的结果。能力选择、项目归属判断和任务推进由 Agent 处理，CLI 负责提供对应的文件与校验能力。返回[架构总览](README.md)。

## 代码如何分工

以下路径相对于 `core/runtime/src/`，链接指向现有源码。

| 层次 | 实现 | 职责 |
| --- | --- | --- |
| 顶级分发 | [cli.js](../../runtime/src/cli.js) | 识别命令、定位 KSF 根、加载命令适配器、写出结果与退出码；直接处理部分简单命令 |
| 参数与输出适配 | [commands](../../runtime/src/commands) | 解析操作、目标及选项，拒绝无效组合，调用服务，转换文本或 JSON 输出 |
| 可复用服务 | [services](../../runtime/src/services) | 组织对象、项目、元数据、能力上下文和用户数据操作；业务调用复用函数接口 |
| 领域规则与存储 | [objects](../../runtime/src/objects)、[metadata](../../runtime/src/metadata)、[user-data](../../runtime/src/user-data) | 身份解析、格式校验、路径约束、快照、锁和发布 |
| 系统生命周期 | [distribution](../../runtime/src/distribution) | 构建、归档、网络、发行、升级、回滚、已提交系统差异及公开贡献 |

目前并非每个命令都经过完全相同的文件布局。例如项目服务将目录与锁逻辑放在服务文件中，distribution 适配器直接调用对应领域模块。维护时按实际所有权复用代码，不为形式一致复制一层服务。

业务复用通过函数接口进行，不启动另一条 CLI 来获取同一套规则。隔离候选运行时验证、Git、系统 diff3 或测试运行器使用子进程，是相应操作本身的一部分。

## 两条实际调用链

`user-data read settings --json`：cli.js → [commands/user-data.js](../../runtime/src/commands/user-data.js) → [services/user-data.js](../../runtime/src/services/user-data.js) → schema 与 storage。schema 确认 settings 已注册，storage 读取和校验文件快照，服务整理结果，命令层输出 JSON。目标缺失成功返回 missing，不生成默认配置文件。

`context capabilities --json`：cli.js → [commands/context.js](../../runtime/src/commands/context.js) → [services/context.js](../../runtime/src/services/context.js) → [services/objects.js](../../runtime/src/services/objects.js)。对象层决定有效身份、用户接管与错误；context 只投影工作流和搭档的发现字段。程序不据此自动作语义匹配。

## 输入输出与副作用

标准命令结构和参数设计由 [CLI 命令设计规范](../CLI命令设计规范.md)持有。后续接口使用明确的命令、操作、目标和选项；路径输入按已定位的 KSF 根解析，具体命令仍以自身契约为准。JSON 输入按数据解析，不能拼接成可执行表达式。

对象、metadata、project、context、user-data 和 distribution 等命令提供带 ok、data、errors 等字段的结构化结果，但精确字段及错误位置各有契约；hello、build、runtime verify 等保留自身响应格式。调用者不能给所有命令套用同一反序列化结构。

成功一般退出 0，业务、校验或 I/O 失败退出 1，参数错误退出 2。部分查询退出 1 时仍可能在 stdout 返回有效的部分数据，应同时检查 complete 和 errors。启动阶段错误应查看 stderr，不能将没有 JSON 当成空结果。

需要分别判断两类写入：命令自身是否修改业务目标，以及共同启动是否准备本机运行时。只读或 `--dry-run` 命令仍可能经过后者；不能从命令名称推断整个进程零写入。预览也不等于离线，例如 system update 的预览会获取并验证候选，但不切换当前系统。

## 新增或修改命令

1. 先界定操作管理的对象、最小接口、路径基准、修改范围及所属状态目录，核对现有服务能否承接。
2. 在适配层处理参数、帮助、输入和结果；领域校验与存储约束放入负责该规则的服务或模块。避免由两个命令分别维护同一套规则。
3. 在 cli.js 注册并补帮助入口。让服务返回业务结果，由命令层决定文本、JSON 与退出码。
4. 增加实际行为测试：参数拒绝、查询缺失或部分结果、写入冲突及文件保留；有跨 cwd 路径输入时验证从其他目录调用。测试放入临时工作区，避免修改真实用户数据。
5. 同步 [CLI 索引](../cli/index.md)、[能力总览](../cli/overview.md)和命令说明；机制变化时更新本目录对应专题，再通过 build 刷新摘要。

调用示例、已有操作词和通用选项是词汇约定，不表示新命令必须全部实现。精确接口以命令帮助和相应文档为准；Windows 当前尚不能执行这些完整业务命令。

## 实现与验证来源

架构约束见[命令设计规范](../CLI命令设计规范.md)。适配层验证见 [cli.test.js](../../runtime/tests/cli.test.js)、[context-cli.test.js](../../runtime/tests/context-cli.test.js)、[objects-cli.test.js](../../runtime/tests/objects-cli.test.js)、[projects-cli.test.js](../../runtime/tests/projects-cli.test.js)、[metadata-cli.test.js](../../runtime/tests/metadata-cli.test.js)。user-data 的命令与服务验证见 [user-data.test.js](../../runtime/tests/user-data.test.js)与 [identity.test.js](../../runtime/tests/identity.test.js)，系统生命周期另见[生命周期专题](lifecycle.md)。
