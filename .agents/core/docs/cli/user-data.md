# user-data 命令

已实现 KSF 系统级用户数据及能力对象配置／必要状态的独立存储、格式校验和按版本写入。遵循 [CLI 命令设计规范](../CLI命令设计规范.md)。

## 内容边界

| 位置 | 内容及管理方式 |
| --- | --- |
| `.agents/core/` | 系统程序、默认配置、系统定义，随发行版本管理 |
| `.agents/user-data/` | KSF 程序与能力对象的用户级设置和必要状态，随用户实例保存、备份或迁移 |
| `.agents/runtime-data/` | 本机运行时、缓存、进程身份、锁、升级事务和备份，默认不提交 |
| `项目/`、`知识/`、`能力/` 等正常用户空间 | 正常工作中的项目进展、任务记录、草稿、成果、知识和个人能力 |

系统命名空间由 Core 注册并逐字段校验，当前包括 `settings`、`identity`、`sources`、`instance`、`desktop`、`appearance` 和 `incubation`。incubation 保存首次孵化生命周期及必要恢复回执，通常经[孵化接口](incubation.md)管理，不应手动伪造完成状态。能力对象另通过 `--object <id>` 使用通用 JSON 配置空间，无须逐个注册字段。两者均不承接任务正文、成果、知识、登录凭据或能力定义，也不增加第五类能力对象。

`instance` 接受显示名 `name`；`desktop` 接受完整的 `preferences` 桌面模型；`appearance` 接受完整的 `settings` 材质模型。默认值、浏览器迁移、GUI/CLI 共用接口及生效规则见[统一配置中心](../configuration-center.md)。旧命名空间与顶层字段更新规则保持兼容。

`desktop` 新写入使用 `schema_version:2`，读取继续支持旧版本1且不改写原件。布局中的 `kind:"app"` 表示固定1×1的应用启动图标，同一分组按 `appId` 去重；缺省 `kind` 的旧条目仍是功能卡片。`preferences.shortcuts` 保存主页分组身份和已处理的安装身份，与布局一起进行版本检查和发布。Core 数据兼容检查阻止切换到不支持版本2的旧读取方；其他命名空间的版本保持不变。

当前聊天的动态运行变量与轮次使用独立 [chat](chat.md) 命令，数据在 `.agents/user-data/chats/`，不混入跨聊天的 abilities 配置。user-data list 将 chats 识别为独立功能目录，不展开聊天变量。

入口文件保持原有职责；除模板生成的空目录占位外，首次真实写入时才创建命名空间文件。读取、检查和缺失目标均不自动创建配置文件。

## 调用

```sh
.agents/ksf user-data list --json
.agents/ksf user-data read settings --json
.agents/ksf user-data check settings --json
.agents/ksf user-data write settings --data '{"updates":{"request_timeout_seconds":20}}' --if-match missing --dry-run --json
.agents/ksf user-data write settings --data '{"updates":{"request_timeout_seconds":20}}' --if-match missing --json
# 后续修改或删除使用 read 返回的实际 etag，替换下面的占位值。
.agents/ksf user-data remove settings --if-match '<etag>' --dry-run --json
```

namespace 为已注册名称，不接受文件路径。支持命令级及操作级 `--help`、`-h`。`list` 不接受位置目标，其他操作指定一个命名空间或 `--object <id>`，两者互斥。`--` 结束选项解析。Windows 对应 `.agents/ksf.ps1`；Windows 已接入随包 Node 与共享业务 CLI；实际平台行为及验证范围见[平台支持](../runtime/platforms.md)。

| 操作 | 参数及作用 |
| --- | --- |
| list | `[--objects] [--json]`，默认列注册命名空间，--objects 列对象记录；不含 values；无效文件或未知目录条目返回部分结果和 complete:false |
| read | `(<namespace> \| --object <id>) [--json]`，读取用户覆盖值和当前 etag；缺失成功返回 missing，不把默认值写入用户文件 |
| check | `(<namespace> \| --object <id>) [--json]`，核对格式、版本与内容；缺失时 valid:null，不修复 |
| write | `(<namespace> \| --object <id>) (--data <JSON> \| --from <file>) --if-match <etag\|missing> [--dry-run] [--json]`，合并提供的顶层字段；每个提供字段的值整体替换 |
| remove | `(<namespace> \| --object <id>) [--fields <name...>] --if-match <etag\|missing> [--dry-run] [--json]`，默认删除该记录文件；对象可用 --fields 只清除选定键，不删除其他文件或整个目录 |

`--data` 与 `--from` 二选一，输入为 values 映射，不是整个持久化信封。`--from` 相对路径按 KSF 根解析，也支持绝对路径；输入为 UTF-8 JSON，最多 1 MiB。选项不可重复，未知参数报错，不接受 `--force`。`--if-match` 是防止覆盖新版本的写入前提，不是用户授权或审批。

## 能力对象配置与必要状态

四类对象（cooperation、partner、competency、data-package）均可使用，包含固定入口及关联能力源；无需先安装对象或声明字段。`--object` 只接受完整三段 ID，不接受路径、`@version` 或同时指定命名空间。数据按 ID 延续，不按来源、版本或目录分别保存；更换 ID 使用新的空间。

```sh
.agents/ksf user-data list --objects --json
.agents/ksf user-data read --object partner.example.research --json
.agents/ksf user-data check --object partner.example.research --json
.agents/ksf user-data write --object partner.example.research --data '{"preferred_language":"中文","output_directory":"reports"}' --if-match missing --dry-run --json
# 确认保存后移除 --dry-run；后续写入或删除必须使用 read 返回的实际 etag。
.agents/ksf user-data remove --object partner.example.research --fields output_directory --if-match '<etag>' --json
.agents/ksf user-data remove --object partner.example.research --if-match '<etag>' --json
```

首版文件位于 `.agents/user-data/abilities/<完整ID的UTF-8字节SHA256>.json`，格式为 `{schema_version:1,object_id,revision,values}`。文件名必须对应内部 ID；大小写和中文按精确 ID 处理，不做自动转写。单文件包含格式信封在内最多 1 MiB。values 为普通 JSON 映射，不接收函数、非安全数值或自定义对象；程序不要求对象声明字段类型，也不自动理解字段含义或识别所有敏感内容。

write 合并顶层字段，每个嵌套值整体替换，null 是保留的值。`remove --fields` 仅限对象数据，按完整顶层键名删除，不解释点号路径；键名以连字符开头可使用 `--fields=<name>`。不存在的键返回 missingFields，不产生新修订。删除最后一个键仍保留空记录；不带 --fields 才删除整份记录。预览与真实写入均验证完整文件大小。

对象 read/check 的 data 使用 objectId 替代 namespace，其余 state、path、etag、schemaVersion、revision、values 语义沿用命名空间接口。字段删除额外返回 removedFields、missingFields 和提议 revision。`list --objects` 只列已有记录的 ID、路径、状态、etag 和版本摘要；没有 values，不需要对象存在。坏文件、名称不匹配或同步副本使 complete:false，并保留其他有效结果和原件。默认 list 仍列系统命名空间，不展开对象记录。

对象记录与命名空间共享快照、校验、锁和发布机制，但锁按对象摘要隔离，位于 `.agents/runtime-data/user-data/abilities/<摘要>.lock`。对象归档、删除、升级、改目录或能力源解除关联均不删除其数据；显式 remove 才清除。Core 发行和能力源分享不携带这些个人值，复制 user-data 可迁移数据，本机锁不迁移。读取、检查、缺失删除和 dry-run 不创建对象文件或本机锁。

采用与覆盖规则见[系统级用户数据](../system/user-data.md#能力对象的持久数据)。这是通用存储与 Agent 使用约定，不是自动执行对象或自动学习用户偏好的后台服务。

## settings

可写值：

```json
{
  "updates": {
    "check_interval_seconds": 86400,
    "request_timeout_seconds": 10
  }
}
```

两个字段都可省略。检查间隔必须为不小于 60 的安全整数秒；请求超时必须为 1—60 的整数秒。不接受自动更新开关、发行身份、密钥、绝对路径、任务正文或其他未定义字段。

有效值由 Core 默认配置加用户覆盖组成：显式 system 命令读取 settings.updates；省略字段回到 `.agents/core/distribution.json` 的默认值。程序不改写默认配置。`updates` 是一个顶层字段，因此写入 `{"updates":{"request_timeout_seconds":20}}` 会替换旧 updates 映射；旧映射中未再提供的检查间隔回到默认。写入 `{}` 保持现有覆盖不变；删除 settings 文件则清除全部覆盖。

另支持 `routing: {"enabled": false}`，enabled 必须为布尔值，缺省为 true。它控制 [route start/write](route.md) 是否保存 Agent 上报；关闭时零路由写入，read/list 和 Web 仍可读取既有记录。routing 是独立顶层字段，不影响 updates；任务简述和路由历史不存入 settings。

检查间隔只约束用户显式调用 `system sync` 的间隔；普通启动和读取仍不访问版本源或自动升级。Core 构建与发布读取系统默认配置，不读取或合并维护者的 user-data。

## identity 本地身份设置

identity 保存用户自行填写的名称、联系邮箱和对象命名空间，位置为 `.agents/user-data/identity.json`。它使用现有 write/read/check/remove 接口；“设置数据”使用 write，不新增同义 set 操作。

| 字段 | 内容与校验 |
| --- | --- |
| name | 显示名称，非空、最长 200、不含控制字符 |
| email | 单个联系邮箱，最长 254，检查基本地址格式；不验证邮箱所有权 |
| namespace | 对象 ID 中间一段，沿用对象 ID 的单段规则，支持中文，禁止点号、空白和路径非法字符 |

三个字段均可单独写入，省略字段保留原值。未知字段报错，不接受 GitHub 绑定信息或自报“已验证”标志。不同用户可设置相同值；不查询 GitHub、不检查账号存在性或全局唯一性，也不读写 Git 配置。

以下示例会保存本地数据；名称、邮箱和命名空间均为示例，使用前替换为实际值。首次文件缺失用 missing，以后修改使用 read 返回的 etag：

```sh
.agents/ksf user-data write identity --data '{"name":"示例用户","email":"author@example.invalid","namespace":"example-author"}' --if-match missing --json
.agents/ksf user-data read identity --json
.agents/ksf user-data check identity --json
```

保存 namespace 不会自动重写对象 ID、目录或 references。当前对象 CLI 仍接受完整 ID，例如 `competency.example-author.architecture-analysis`；创建者可读取 identity 后使用该命名空间。name/email 不自动写入对象元数据或公开贡献。

## 持久化与版本

每个注册命名空间使用同样的版本信封。以 `.agents/user-data/settings.json` 为例：

```json
{
  "schema_version": 1,
  "namespace": "settings",
  "revision": 1,
  "values": {
    "updates": { "request_timeout_seconds": 20 }
  }
}
```

schema_version 按命名空间解释，revision 在实际内容变化时增加；同值写入保留原字节、etag 和 revision。etag 为完整文件字节的 SHA256，缺失时为字符串 missing。revision 不是跨设备全局时钟；写入必须匹配 etag，不能只比较 revision 大小。

文件损坏、合并冲突标记、未知字段、未知格式版本均报错并保留原文件，普通 write/remove 不强行修复。首版没有旧格式，暂不提供虚构的迁移操作；未来格式升级由所属功能增加明确迁移步骤，迁移前保留原文件及版本核对。未知的更高版本不能被旧 Core 重写。

## 写入与冲突

真实修改使用 `.agents/runtime-data/user-data/<namespace>.lock`，锁、PID 不进入可迁移目录。写入采用同目录临时文件、fsync 和原子替换，发布前再次核对旧文件；已变化则返回 USER_DATA_CONFLICT。进程间锁协调使用本接口的写入，不能代替分布式同步或阻止任意外部编辑器的最后瞬间修改。

`--dry-run` 不创建 user-data 文件、临时文件或本机写锁；共同 CLI 启动仍可能准备本机运行时。已有锁不自动按 PID 抢占。读取与检查不删除同步冲突副本；list 报告未知或冲突条目，供用户核对。重复使用旧 etag 会冲突；响应未知时先 read 对账，再决定是否重试。

## Git、发行与跨设备

- Core 源码仓库继续忽略真实 user-data；发行只生成 `.agents/user-data/.gitkeep` 空目录占位，不读取或复制维护者的设置。
- 用户模板允许 settings.json、identity.json 进入用户自己的仓库，忽略 user-data 根及嵌套目录中的 `.tmp` 原子写临时文件；JSON（包含 abilities 嵌套目录）使用 LF，避免 Windows 检出改变字节摘要。
- Core 升级和回滚的管理范围不包含 user-data，用户设置保留原样。升级 Core 不等于迁移用户数据格式。
- 同步或复制 user-data 后，新设备读取相同版本格式和覆盖值，本机锁与运行环境重新建立。当前不是自动同步服务，也不把用户的历史设置解释为发起远程操作的授权。
- Gitignore 只约束 Git；整目录网盘同步仍需排除 runtime-data。损坏或冲突数据保留后处理，不自动最后写入覆盖。

## 输出与错误

统一 JSON：`{ok,command:"user-data",operation,data,errors}`。read/check 提供 namespace、相对 path、state、etag、schemaVersion、revision、values；修改另外提供 dryRun、changed、wouldChange、beforeEtag。预览的 etag 仍为当前文件的 etag，revision/values 是提议结果；list 提供 entries、complete。

成功或缺失退出 0；参数、无效 JSON 输入、互斥及重复参数退出 2；目标数据损坏、版本不支持、冲突、锁或 I/O 错误退出 1。业务结果写 stdout；本机锁清理提示写 stderr。

主要错误：USER_DATA_NAMESPACE_UNKNOWN、USER_DATA_INVALID、USER_DATA_VERSION_UNSUPPORTED、USER_DATA_PATH_INVALID、USER_DATA_CONFLICT、USER_DATA_LOCKED、USER_DATA_UNKNOWN_ENTRY、USER_DATA_INPUT_UNREADABLE、USER_DATA_IO_FAILED。

实现为 `src/user-data/`、`src/services/user-data.js`、`src/commands/user-data.js`。验证见 [user-data.test.js](../../runtime/tests/user-data.test.js)、[identity.test.js](../../runtime/tests/identity.test.js)和 [user-data-distribution.test.js](../../runtime/tests/user-data-distribution.test.js)，覆盖格式、迁移、并发和参数，以及发行隔离、升级回滚保留和 Git 边界。实际平台与运行结果以测试记录为准。

## sources 能力源关联

新增 sources 命名空间，values 为 `{"entries":[{"id":"team-methods","path":"repositories/team-methods"}]}`。只保存稳定源 ID 和本地路径，不保存凭据、正文或版本锁。字段格式由 schema 校验，实际声明、Git 根与依赖由 source link/check 和读取方核对；推荐通过[source](source.md)操作。未知协议和身份变化保留配置并报错，解除旧关联后可按实际路径重新关联。
