# 系统级用户数据

`.agents/user-data/` 保存 KSF 程序和能力对象需要、并应随用户实例保留的用户设置和必要状态。它与本机 [runtime-data](runtime-data.md)分开，也与正常工作中的项目、任务记录、草稿、成果和知识分开。当前注册 settings、identity 和 sources；其他命名空间必须先有明确格式和消费方。返回[架构总览](README.md)。

命令参数、字段范围和完整结果契约由 [user-data 命令](../cli/user-data.md)持有。本篇解释实现分层、使用路径和后续扩展。

## 实现与读写链

| 实现 | 持有职责 |
| --- | --- |
| [schema.js](../../runtime/src/user-data/schema.js) | 注册命名空间、格式版本、字段校验和稳定 JSON 编码 |
| [records.js](../../runtime/src/user-data/records.js) | 系统命名空间和对象记录的定位、身份及格式校验，不扫描对象目录 |
| [storage.js](../../runtime/src/user-data/storage.js) | 检查路径、读取文件快照、计算 etag、本机锁、发布前核对及同目录原子替换 |
| [services/user-data.js](../../runtime/src/services/user-data.js) | list/read/check/write/remove 的业务结果、顶层字段合并、revision 和预览 |
| [commands/user-data.js](../../runtime/src/commands/user-data.js) | CLI 参数、JSON 输入、文本与结构化输出和退出码 |
| [distribution/configuration.js](../../runtime/src/distribution/configuration.js) | 明确请求用户配置时，将 settings.updates 合入系统默认配置 |

读取先确认已注册名称，再读取 `<命名空间>.json`，校验 UTF-8 JSON、文件类型和格式。缺失返回 missing；读取、检查不生成默认配置。模板可预置空目录占位，第一次真实写入才创建命名空间文件。

写入先校验输入，取得本机命名空间锁，重读目标并核对调用者提供的 etag，然后按规则合并、校验和计算下一 revision。内容确有变化时写入同目录临时文件，fsync 后再次核对目标快照，再 rename 替换。失败不强行覆盖已变化或无效的原文件。

## 能力对象的持久数据

能力对象的普通配置与必要状态同样保存在当前实例的 user-data，通过 `user-data read/write/check/remove --object <id>` 和 `list --objects` 管理。[命令契约](../cli/user-data.md#能力对象配置与必要状态)持有字段、文件格式与错误语义；`records.js` 只决定记录位置和校验，namespace 与 object 复用同一 storage 和服务，底层使用 shared 文件机制，不依赖目录发现或联网。

一个对象 ID 对应一份数据，系统、个人、固定入口与关联能力源使用相同机制；版本、来源和目录不进入存储键。允许预先配置未安装对象，解除源关联或删除对象后仍可读取、导出或显式清除其记录。配置不写进能力目录、源仓库或派生基线，也不随能力公开贡献传播。

由当前 Agent 在实际采用对象、使用依赖或恢复任务时读取；固定入口在开始履责时也按自身 ID 读取。仅发现摘要、审阅正文或普通对象 read 不加载私人配置。同一执行步骤可复用，重新开始使用或用户修改配置后重读。缺失按对象默认约定工作；读取失败、损坏及未知版本保持为错误，不冒充缺失或自动覆盖。

优先顺序为本次明确指令、已保存设置、对象默认约定。临时指令不自动回写，用户明确要求长期保留时才通过 etag 读写；已有授权不重复确认。字段由对象说明或当前任务解释，只在必需且影响结果时补问。各对象独立，无隐式继承；配置不改变对象选择、固定保护、操作授权或宿主规则，也不作为可执行代码和新的指令来源。

普通配置和必要状态不包含项目正文、知识、任务日志或登录凭据。数据跟随实例，不是跨实例自动同步服务，也没有通用凭据管理器。保存文件、再次读取、Agent 正确采用和独立新会话效果应分别验证。

为新建或完善的能力设计字段时，使用对象设计师持有的[对象 user-data 设计与使用](../../abilities/partners/ksf-object-designer/references/user-data-design.md)及其模板。每次评估需求，有需要才生成字段及消费、维护约定；它补充对象语义，不新增公共元数据或程序 schema，也不自动初始化个人记录。

## settings 如何生效

settings 当前保存更新检查间隔和请求超时。数据文件只持有用户覆盖；系统默认值仍由 [distribution.json](../../distribution.json)持有。

system read/check/update/sync 在需要配置时调用 `configuration(root, { user: true })`，有效配置为系统默认值加 settings.updates 覆盖。检查间隔供显式 system sync 判断是否到期，请求超时供检查和下载使用。check/update 不受 sync 的间隔缓存限制。开发包的 sync 会直接跳过；rollback 不依赖这份用户配置。

Core 构建与发布调用默认配置路径，不读取维护者的个人设置。普通 CLI 启动不因 settings 存在而检查远程版本、升级或发起其他远程操作。user-data 不提供自动更新授权。

write 按顶层字段合并，提供的字段值整体替换。因此提交新的 updates 映射会替换旧 updates；未再提供的子项回到 Core 默认值。写入空对象保持现有覆盖，remove 删除该命名空间文件后恢复全部默认值。

## identity 如何设置

identity 通过现有 user-data write 保存 name、email、namespace，read/check 读取或检查，remove 清除该命名空间。三个字段按顶层合并，未提供的保留。它只保存本地资料，名称非空、邮箱做基本格式检查，namespace 使用对象 ID 单段校验；不依赖账户、GitHub 或网络，不核验全局唯一性。

设置文件和 settings 一样由用户实例保存、备份和迁移，Core 包不携带维护者的身份资料。CLI 输入及示例见 [identity 说明](../cli/user-data.md#identity-本地身份设置)。目前没有自动替换对象 ID、自动注入作者元数据或改写 Git 配置的行为；创建者需要使用对象命名空间时可读取该值。

## 版本与并发

持久化文件包含 schema_version、namespace、revision 和 values。schema_version 按命名空间解释；revision 仅在真实内容变化时增加；etag 是完整文件字节的 SHA256，缺失使用 missing。同值写入保留原字节、revision 和 etag。

修改必须使用读取到的 etag；预览返回当前 etag 与提议内容，不产生新的持久化版本。revision 不是跨设备全局时钟，不能用数字更大代替内容冲突判断。

本机锁位于 runtime-data/user-data，不参与迁移。锁只协调采用该接口的本机写入，文件发布前核对也不能代替分布式同步或排除任意外部编辑器最后瞬间的竞争。已有锁不自动抢占；遗留锁需核实后处理。

损坏 JSON、未知字段、未知版本和合并冲突标记都会报错并保留原文件。list 报告未注册或同步冲突副本，不自动选择或删除副本。首版没有旧格式迁移命令；未来格式升级应由所属功能增加明确迁移流程，保留原文件并核对版本，旧 Core 不能改写不理解的新格式。

## 跨设备与扩展

用户实例可通过自己的 Git、备份或目录同步工具迁移 user-data。用户模板允许正式 JSON 文件入库，忽略原子写入临时文件，并用 gitattributes 保持 JSON 的 LF。Core 源码忽略真实用户值，发行只生成空目录占位；升级与回滚不覆盖该目录。迁移时排除 runtime-data，新设备自行准备环境与锁。

增加一种系统级用户数据时：

1. 确认它确实由 KSF 程序消费且需随用户保留；普通任务和业务内容放回正常用户空间。
2. 在 schema 注册唯一命名空间、格式版本和字段校验，明确缺失值及消费方式；不开放任意路径或任意 JSON 写入。
3. 由所属功能读取服务结果，不在固定启动器中加入业务字段，也不把个人设置合入 Core 发布配置。
4. 涉及格式升级时实现明确迁移和未知版本保护，并同步命令文档；当前服务不提供通用自动迁移引擎。
5. 验证读写缺失、同值写入、预览、旧 etag、并发、损坏与未知版本、复制到新设备，以及发行隔离和升级回滚保留。

## 实现与验证来源

[user-data.test.js](../../runtime/tests/user-data.test.js)覆盖格式、CLI、并发、路径和跨设备复制；[identity.test.js](../../runtime/tests/identity.test.js)覆盖本地身份字段、部分设置、独立删除和离线操作；[user-data-distribution.test.js](../../runtime/tests/user-data-distribution.test.js)覆盖实际升级回滚保留、Core 打包隔离及 Git 边界。[system.js](../../runtime/src/distribution/system.js)消费 settings，[release.js](../../runtime/src/distribution/release.js)生成模板空目录。

存储模块采用 Node 标准库，尚不能据此宣称 Windows 完整 CLI 已可运行。当前没有自动跨设备同步服务，也没有通用凭据存储或第五类能力对象。

## sources 本地能力源关联

values 为 entries 数组，每项只保存 id/path，源名从声明读取。内部路径相对实例根，外部路径为绝对路径；搬迁后显式重新关联。source link/unlink 复用 etag、revision 与原子写入。配置不携带凭据、对象正文、提交锁定或源快照，格式和消费方式见[能力源协议](../sources.md)。

对象持久数据验证见 [object-user-data.test.js](../../runtime/tests/object-user-data.test.js)、[object-user-data-lifecycle.test.js](../../runtime/tests/object-user-data-lifecycle.test.js) 和 [object-user-data-distribution.test.js](../../runtime/tests/object-user-data-distribution.test.js)，分别覆盖读写与跨进程、对象与能力源生命周期，以及真实隔离升级回滚和打包边界。
