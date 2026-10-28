# CLI 分层与扩展

CLI 把宿主传入的命令变成确定性的查询或修改，并返回调用者可判断的结果。能力选择、项目归属判断和任务推进由 Agent 处理，CLI 负责提供对应的文件与校验能力。返回[架构总览](README.md)。

## 代码如何分工

以下路径相对于 `core/runtime/src/`，链接指向现有源码。

| 层次 | 实现 | 职责 |
| --- | --- | --- |
| 顶级分发 | [cli.js](../../runtime/src/cli.js) | 识别命令、定位 KSF 根、加载命令适配器、写出结果与退出码；直接处理部分简单命令 |
| 参数与输出适配 | [commands](../../runtime/src/commands) | 声明允许的选项，校验操作、目标及组合，调用服务，转换文本或 JSON 输出 |
| 可复用服务 | [services](../../runtime/src/services) | 组织对象、项目、元数据、能力上下文和用户数据操作；业务调用复用函数接口 |
| 领域规则与存储 | [objects](../../runtime/src/objects)、[projects](../../runtime/src/projects)、[metadata](../../runtime/src/metadata)、[user-data](../../runtime/src/user-data) | 身份与格式规则、内存变更计算，以及各业务的路径约束、锁策略和发布方式 |
| 系统生命周期 | [distribution](../../runtime/src/distribution) | 构建、归档、网络、发行、升级、回滚、已提交系统差异及公开贡献 |
| 通用基础机制 | [shared](../../runtime/src/shared) | 文件描述符与临时文件生命周期、独占锁、值校验与比较、哈希、路径字符串转换、参数扫描；不依赖业务服务 |

目前并非每个命令都经过完全相同的文件布局。例如项目服务保留目录与锁策略，distribution 适配器直接调用对应领域模块。维护时按实际所有权复用代码，不为形式一致复制一层服务。

业务复用通过函数接口进行，不启动另一条 CLI 来获取同一套规则。隔离候选运行时验证、Git、系统 diff3 或测试运行器使用子进程，是相应操作本身的一部分。

## 变更计算与文件提交

对象写入通过 [services/objects.js](../../runtime/src/services/objects.js) 读取目录、资源和基线，由 [objects/plan.js](../../runtime/src/objects/plan.js) 计算候选元数据、精确依赖、修订号和序列化内容，最后由服务执行提交。纯引用解析在 [objects/references.js](../../runtime/src/objects/references.js)，Markdown 链接转换在 [objects/markdown.js](../../runtime/src/objects/markdown.js)，不需要文件系统。

项目写入同样由服务读取状态，再由 [projects/plan.js](../../runtime/src/projects/plan.js) 计算元数据合并、正文替换、字节内容及变更结果，服务负责目录准备、发布和删除恢复。规划函数只处理传入状态，不修改原始 YAML 文档，不获取锁或执行文件操作。预览和真实写入复用规划函数；预览结果的 changed 仍为 false。为保持错误顺序，项目写入继续在获取锁前预检序列化，获取原有项目锁后重读并重新计算。

`updateProjectMetadata` 保留“项目锁内读取最新根卡 → 执行转换 → 计算变更 → 文件锁内发布”的顺序，供 repository 关联操作复用。对象、项目、metadata、user-data 和 repository 只共享独占锁的创建与所有权清理机制，锁路径、范围、顺序、错误和清理通知仍由各业务持有。

[shared/files.js](../../runtime/src/shared/files.js) 管理文件快照、持久化暂存和资源清理；调用方决定路径策略、身份比较字段、权限及替换或创建方式。对象目录派生、项目目录删除和发行事务保留各自实现。user-data 继续要求精确 etag；本次分层不为对象与项目增加新的读后写版本条件。

参数扫描由 [shared/options.js](../../runtime/src/shared/options.js) 处理，命令声明布尔、单值、多值和选项别名。metadata 的 `--fields=<name>` 继续吸收后续普通字段，distribution 的 `--paths=<path>` 仍只取内联值；两者不能互换。context 保留自身简单、严格的语法校验，共用 JSON 模式识别。帮助、参数组合、错误信息、结果格式和退出码由命令适配器持有。

distribution 的错误、路径、文件操作、版本、配置和发行清单分别归入对应模块；配置读取才依赖用户设置服务。`common.js` 仅保留旧导出兼容入口，运行时代码直接引用实际所有者，避免归档等纯工具加载配置服务。通用值校验在 shared，metadata 输入适配层负责转换为原有错误。

## 两条实际调用链

`user-data read settings --json`：cli.js → [commands/user-data.js](../../runtime/src/commands/user-data.js) → [services/user-data.js](../../runtime/src/services/user-data.js) → schema 与 storage。schema 确认 settings 已注册，storage 读取和校验文件快照，服务整理结果，命令层输出 JSON。目标缺失成功返回 missing，不生成默认配置文件。

`context capabilities --json`：cli.js → [commands/context.js](../../runtime/src/commands/context.js) → [services/context.js](../../runtime/src/services/context.js) → [services/objects.js](../../runtime/src/services/objects.js)。对象层决定有效身份、用户接管与错误；context 只投影协同和搭档的发现字段。程序不据此自动作语义匹配。

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

调用示例、已有操作词和通用选项是词汇约定，不表示新命令必须全部实现。精确接口以命令帮助和相应文档为准；Windows x64 已通过平台适配器接入同一 CLI，具体测试覆盖见双平台验收记录。

## 实现与验证来源

架构约束见[命令设计规范](../CLI命令设计规范.md)。适配层验证见 [cli.test.js](../../runtime/tests/cli.test.js)、[context-cli.test.js](../../runtime/tests/context-cli.test.js)、[objects-cli.test.js](../../runtime/tests/objects-cli.test.js)、[projects-cli.test.js](../../runtime/tests/projects-cli.test.js)、[metadata-cli.test.js](../../runtime/tests/metadata-cli.test.js)。user-data 的命令与服务验证见 [user-data.test.js](../../runtime/tests/user-data.test.js)与 [identity.test.js](../../runtime/tests/identity.test.js)，系统生命周期另见[生命周期专题](lifecycle.md)。

[shared-files.test.js](../../runtime/tests/shared-files.test.js) 验证锁所有权、暂存清理、发布冲突与权限；[mutation-plans.test.js](../../runtime/tests/mutation-plans.test.js) 在无真实文件的状态中比较预览和执行计划，并检查输入未被修改；[cli-options.test.js](../../runtime/tests/cli-options.test.js) 保存重构前的参数契约；[runtime-layers.test.js](../../runtime/tests/runtime-layers.test.js) 检查基础层依赖、规划模块的静态导入闭包和循环依赖。静态检查包含字面量动态导入，不覆盖运行时计算的模块路径，也不能代替实际行为测试。
