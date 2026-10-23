# repository 命令说明

## 状态与职责

已实现本地独立 Git 工程创建、项目关联、解除关联、列举和检查。默认容器是 KSF 用户根下的 `repositories/`，不加前缀；容器自身不初始化 Git，子工程各有独立 Git 根。外层 KSF Git 忽略整个容器。已有外部工程可原位关联。

`项目/` 保存目标、事实、决定、纠偏、进展及成果入口；实际工程代码、文档和成果正文保存在工作区。项目与工程允许多对多。首次需要时创建容器；未创建时 list/check 返回完整空集合。普通启动不要求 Git，仓库操作需要本机 Git。

## 调用与操作

```sh
.agents/ksf repository create "环境监测" --dry-run --json
.agents/ksf repository create "环境监测" --json
.agents/ksf repository link "repositories/环境监测" --project "客户方案" --dry-run --json
.agents/ksf repository link "repositories/环境监测" --project "客户方案" --json
.agents/ksf repository link "/path/to/existing-project" --project "客户方案" --json
.agents/ksf repository list --json
.agents/ksf repository list --project "客户方案" --json
.agents/ksf repository check --project "客户方案" --json
.agents/ksf repository unlink "repositories/环境监测" --project "客户方案" --json
```

| 操作 | 目标与行为 |
| --- | --- |
| create `<name>` | 在 repositories 下创建指定单层目录并 git init；默认 main，无初始提交及远程；已存在有效独立仓库时无变化 |
| link `<path>` `--project <项目目录名>` | 核实路径本身就是 Git 工作树根，再给已有根卡追加关联；重复关联无变化 |
| unlink `<path>` `--project <项目目录名>` | 只移除根卡中的对应关联；未关联时无变化；允许工程路径已失效 |
| list `[--project <项目目录名>]` | 默认浅层列出容器直接条目并核实身份；指定项目时读取其关联，可包含外部工程 |
| check `[path \| --project <项目目录名>]` | 无选择时检查容器直接条目；也可检查指定路径或项目全部关联；不修复 |

没有 clone、移动、物理删除、commit 或 push 命令。远程工程可先通过 Git clone 到用户选定位置，再 link。项目归档、project remove 和 unlink 均保留工程原位。

## 参数与关联格式

- create 的 name 是单层目录名，允许中文、空格和连字符；拒绝路径、空白名称、`.`、`..`、控制字符与保留的 `.ksf-` 前缀。`.git` 及大小写、尾随点/空格、HFS+ 忽略字符造成的等价名称同样保留，在调用 Git、创建目录或写锁之前拒绝。不自动增加名称前缀。
- path 是本地路径；相对路径基于启动入口定位的 KSF 根，不受调用者 cwd 影响。绝对路径直接使用。check 的 path 与 --project 互斥。list 不接受位置目标。
- --project 必须是指定项目 scope 下的单层目录名。link/unlink 必填；list/check 可选；create 不接受，不隐式创建项目根卡。
- --dry-run 是无值布尔选项，仅 create/link/unlink 支持；不修改业务目标、不建目录或锁。--json 只改变输出格式，全部操作支持。
- --help/-h 单独使用，命令级及操作级支持。操作后的选项可调整顺序，支持 -- 结束选项解析；例如 `repository create --json -- -工程`。重复、未知、缺值或多目标参数返回退出 2。

结构化关联保存在根卡可选元数据中：

```yaml
repositories:
  - ../../repositories/环境监测
  - /absolute/path/to/existing-project
```

列表各项为非空路径字符串。KSF 内部路径相对根卡目录保存，外部路径以核实后的绝对路径保存。CLI 不保存工程副本、反向关系表或数据库；正文与其他元数据保持原样。旧项目无该字段仍有效，正文链接仍可由 Agent 按原机制读取；不自动提取、重写或迁移旧记录。非法字段值（包括 null）报错，不静默替换。

link 核实真实路径并避免重复；unlink 按保存路径解析后的绝对位置比较，无需目标仍存在。目录移动后由用户或 Agent 明确修订关联；不会猜测同名替代目录。

## 输出与检查边界

业务 JSON 使用 `ok`、`command: "repository"`、`operation`、`data`、`errors`；stdout 返回业务成功、失败和部分结果，stderr 为诊断。退出码 0 成功，1 操作或检查失败，2 调用格式错误。

create 返回 name、path、dryRun、changed、wouldChange、created；实际成功或已有仓库包含 repository 身份。link/unlink 返回 project、path、dryRun、changed、wouldChange 及更新后的 repositories。list/check 返回 complete、repositories；check 另返回 valid。每项提供 name、path、gitRoot、managed、branch、valid；分离 HEAD 的 branch 为 null，尚无提交的 main 仍是有效仓库。损坏条目保留 path 与 valid:false，错误汇总在 errors，不丢弃其他结果。

检查会核实普通目录、实际 Git 根及父仓库隔离。受管理工程必须是 repositories 的直接子目录；容器和最终工程目录不支持符号链接。Git worktree 的 `.git` 文件可用，不要求 `.git` 必须是目录。检查会解析工程与外层 KSF 的 `git-common-dir` 真实路径；共用 Git 历史存储时拒绝通过，包括放在容器外的 KSF worktree，以及直接关联 KSF 自身。独立工程派生的 worktree 仍可使用。仅继承父 KSF Git 的普通子目录不算工程仓库。

若 KSF 位于 Git 工作树内，创建或关联受管理工程前，检查外层索引未跟踪容器内容，且有效忽略规则覆盖容器内路径。不会修改外层索引、Git 配置或自动强制移除已跟踪文件。纯文件夹实例没有外层 Git 索引，仍可创建独立工程。check 不验证业务完成、代码质量、备份完整性或远程可达性。

## 异常、并发与文件影响

| 错误码 | 处理 |
| --- | --- |
| INVALID_ARGUMENTS | 修正目标、选项或输入，退出 2 |
| REPOSITORY_GIT_REQUIRED / REPOSITORY_GIT_FAILED | Git 缺失或本地调用失败，普通 KSF 命令不受影响 |
| REPOSITORY_NOT_FOUND / REPOSITORY_PATH_INVALID / REPOSITORY_ROOT_MISMATCH | 核实路径、文件类型及真实 Git 根；不接管或覆盖已有资料 |
| REPOSITORY_SCOPE_INVALID | repositories 只作容器，不应自身初始化 Git |
| REPOSITORY_SHARED_GIT | 工程与外层 KSF 共用 Git 历史；使用独立工程仓库，命令不改写历史或自动迁移 |
| REPOSITORY_NOT_IGNORED / REPOSITORY_PARENT_TRACKED | 核对根忽略规则与外层索引，再按实际授权修复；命令不自动修复 |
| REPOSITORY_LINKS_INVALID | 核对根卡 repositories 字段，保留原内容 |
| REPOSITORY_LOCKED / PROJECT_LOCKED / FILE_LOCKED | 检查锁持有者，不自动根据 PID 删除遗留锁 |
| REPOSITORY_CONFLICT / PROJECT_CONFLICT / FILE_CONFLICT | 路径或文件并发变化，保留新状态并重新核对 |
| REPOSITORY_IO_FAILED | 文件系统访问失败，核实具体目录与权限后重试 |

create 真实执行使用 `.agents/runtime-data/repositories/write.lock`，仅创建新目录及其 Git 元数据；不写作者身份、业务文件、提交或远程。不带 shell 执行 Git，清除可重定向 Git 目录和索引的环境变量。Git 失败后只清理仍由本次持有的空目录；部分初始化或并发内容保留，失败 data 提供 changed 和 recoveryPath，先对账再恢复。

link/unlink 使用项目服务的同一写锁，在锁内读取最新字段并修改列表，保留根卡正文、其他字段及格式；同时使用元数据文件锁和发布前比较，拒绝覆盖并发编辑。只改一个根卡，不提供跨项目事务。

创建工程与关联项目是两个独立动作。创建成功、关联失败时保留工程，修复根卡后重试 link。启动准备仍可能写本机运行时缓存；只读/预览只承诺命令自身不写业务目标。

当前实例的根 `.gitignore` 和模板源均加入 `/repositories/`。系统升级继续保留已有用户忽略规则；旧实例启用仓库机制时按明确任务补这一行，不由升级静默改写。发行包只读取系统白名单，不收录工程内容或其 Git 历史；容器按需创建，不放入模板必需目录列表。

## 实现与验证入口

- [命令适配](../../runtime/src/commands/repositories.js)、[仓库服务](../../runtime/src/services/repositories.js)及[项目服务](../../runtime/src/services/projects.js)。
- [仓库服务测试](../../runtime/tests/repositories.test.js)、[CLI 测试](../../runtime/tests/repositories-cli.test.js)及[发行隔离测试](../../runtime/tests/repositories-distribution.test.js)。
- 运行 `.agents/ksf test`、`.agents/ksf build --json`、`.agents/ksf runtime verify --json`；测试在临时目录创建虚构工程，真实通过范围以输出为准。

返回[命令索引](index.md)。


## 档案项目的工程关联

link/unlink/list/check 带 --project 时可加 `--scope current|archived`，默认 current；不选择项目时传 scope 为参数错误。create 不接受 scope，仍不自动关联项目。

```sh
.agents/ksf repository check --project "项目名" --scope archived --json
.agents/ksf repository link "repositories/工程名" --project "项目名" --scope archived --dry-run --json
```

路径始终基于实际根卡所在目录解析和保存，关联修改回执给出项目 scope。归档与恢复会重算 repositories 的相对路径，不复制、移动或删除工程。pending 项目操作期间禁止关联修改，读取检查仍可进行；需按项目回执恢复后再继续写入。
