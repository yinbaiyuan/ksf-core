# project 命令说明

## 状态与职责

已实现。管理当前 KSF 根下 `项目/<项目名>/project.md` 的发现、读取、创建、更新、检查及项目目录删除。根卡仍为普通 Markdown，没有必填 ID、版本、修订号或固定章节。

CLI 负责文件操作；主项目判断、来源核对、写入授权和成果验收仍由 Agent 完成。项目不进入能力发现集合，也不支持自动绑定工程、跨会话自动记忆或项目间事务。公共调用规范见 [CLI 命令设计规范](../CLI命令设计规范.md)。

## 调用与操作

```sh
.agents/bin/ksf project list --json
.agents/bin/ksf project read "KSF运行机制测试" --part all --json
.agents/bin/ksf project write "新项目" --data '{"metadata":{"name":"新项目","description":"本项目的目标"},"body":"# 新项目\n\n项目目标。\n"}' --dry-run --json
.agents/bin/ksf project write "新项目" --from project-input.json --json
.agents/bin/ksf project check "KSF运行机制测试" --json
.agents/bin/ksf project check --json
.agents/bin/ksf project remove "新项目" --dry-run --json
```

| 操作 | 目标 | 行为 |
| --- | --- | --- |
| list | 不接受目标 | 返回当前根下直接子目录的根卡摘要，不递归，不展开正文 |
| read | 必填项目目录名 | 读取根卡，默认 metadata 与 body 全部返回，不展开资料 |
| write | 必填项目目录名 | 根卡不存在时创建，存在时只更新提供部分 |
| remove | 必填项目目录名 | 删除整个项目目录，包含根卡、材料、成果及其他子目录 |
| check | 可选项目目录名 | 检查指定根卡；省略时检查全部直接子目录的根卡 |

`remove` 的完整删除范围由目标项目目录明确限定，不接受省略目标、`--all` 或 `--force`。保留项目但退出使用，可按用户要求修改根卡的 status；CLI 不替用户决定状态或移动目录。

## 参数

| 参数 | 类型与默认行为 | 限制 |
| --- | --- | --- |
| name | 单个目录名，read/write/remove 必填，check 可选 | 中文、空格可用；不接受路径、斜杠、反斜杠、控制字符、空白名称、`.`、`..` 或保留的 `.ksf-project-` 前缀 |
| --part | 单个枚举，默认 all | 仅 read；metadata、body、all；未选部分不返回 |
| --data | 单个 JSON 对象字符串 | 仅 write；与 --from 恰选其一 |
| --from | 单个 UTF-8 JSON 文件路径 | 仅 write；相对路径以 KSF 根为基准，绝对路径直接使用；与 --data 同格式 |
| --dry-run | 无值布尔选项，默认 false | 仅 write/remove；不写目标、不建业务目录、临时文件或锁 |
| --json | 无值布尔选项，默认文本 | 所有操作；只改变输出格式 |
| --help 或 -h | 无值帮助选项 | 命令级、操作级支持；单独使用，不与目标或其他选项混用 |
| -- | 结束选项解析 | 操作后的后续参数按目标解释，支持连字符开头的目录名 |

每项选项至多出现一次。未知、重复、缺值、多目标、不支持的选项及格式错误返回退出码 2。标准输入不作为隐式输入来源。

项目目标始终是目录名，例如 `KSF运行机制测试`；不接受 `项目/KSF运行机制测试/project.md`。名称是文件定位依据，metadata.name 可作显示名称，两者不必相同。

## 写入格式与保留范围

```json
{
  "metadata": {"name": "新项目", "status": "active", "tags": ["测试"]},
  "body": "# 新项目\n\n当前目标和下一步。\n"
}
```

顶层只接受 metadata 与 body，至少提供一项。metadata 是普通 JSON 字段映射，按顶层合并，未指定字段保留，嵌套值整体替换，null 是赋值；body 是字符串，提供时整体替换正文，省略时保留。新建根卡必须提供 body，允许明确的空字符串；不自动生成模板。

只修改正文时，保留原 frontmatter 字节；只修改元数据时，保留正文原字节，并尽量保留 YAML 注释和格式。无变化时不重写根卡。已存在的资料目录可以补建根卡，其他文件保持原样。损坏的 YAML、非 UTF-8、符号链接或无法按原意序列化的输入会失败，不静默修复或覆盖。

命令不自动改项目材料、成果、其他项目、外部工程或导航链接。需要同步时由 Agent 根据已授权差异处理。

## 输出

JSON 使用 `ok`、`command: "project"`、`operation`、`data`、`errors`。业务成功、失败及部分结果都写入 stdout，日志与启动诊断在 stderr；退出码 0 为成功，1 为操作失败或检查不通过，2 为调用错误。

| 操作 | data 主要字段 |
| --- | --- |
| list | complete、projects；每项含 name、title、description、status、path |
| read | project，含 name、path、directory、state 及所选 metadata/body |
| check 指定项目 | name、path、valid、state |
| check 全部 | complete、valid、projects，每项包含根卡检查结果 |
| write | name、path、dryRun、changed、wouldChange、created、wouldCreate、changes、写入后的 project |
| remove | name、path、dryRun、changed、wouldChange、removed、将移除的 entries |

结果中的 path、directory 相对 KSF 根。`state: absent` 表示没有 frontmatter，`present` 表示存在合法字段映射。无元数据的根卡也有效。

list 的 title 优先取非空字符串 metadata.name，其次正文的一级标题，否则取目录名；description 与 status 忠实保留原值，缺失时为 null，不自动生成摘要或判断活跃状态。归档项目仍列出，由 project-route 判断适用性。空集合且 complete 为 true 才是完整空库；单项损坏时保留其他有效项，complete 为 false 并返回错误。

write 的 changes 包含变动的元数据字段名和正文是否变化。预览时 changed/created 为 false，wouldChange/wouldCreate 表示计划变化，project 为拟写入内容；实际成功后才报告 changed/created。remove 的预览返回完整目录条目，成功删除后 removed 为 true。

## 检查与异常

check 检查根卡的安全路径、普通文件、UTF-8 和 frontmatter 可解析性。不检查 Markdown 链接、事实来源、章节完整度、预算、项目语义或业务完成情况。只有 `项目/<项目名>/project.md` 是入口；更深的同名文件与没有根卡的目录不成为项目条目。

| 错误码 | 含义 |
| --- | --- |
| INVALID_ARGUMENTS / INPUT_INVALID | 参数或写入信封无效，退出 2 |
| PROJECT_DIRECTORY_MISSING | 读取或发现所需目录不存在，不能当作空库 |
| PROJECT_NOT_FOUND | 指定项目根卡不存在 |
| PROJECT_PATH_INVALID | 项目目录或管理路径含符号链接或不是普通目录 |
| FILE_UNSUPPORTED / FILE_NOT_FOUND | 根卡或输入文件类型不支持或不存在 |
| YAML_INVALID 等 / ENCODING_INVALID | frontmatter 或字符编码不合法，保留原文件 |
| PROJECT_SERIALIZATION_FAILED | 输入序列化后含义改变，停止写入 |
| PROJECT_LOCKED / FILE_LOCKED | 项目锁或根卡元数据锁已被占用，先检查锁持有者 |
| PROJECT_CONFLICT / FILE_CONFLICT | 发布前发现路径、根卡或资料变化，保留并发修改 |
| PROJECT_RESOURCE_UNSUPPORTED / PROJECT_RESOURCE_BUSY | 删除范围包含链接、特殊文件或临时锁定资源 |
| PROJECT_CLEANUP_FAILED | 目录已退出项目集合但清理失败，data 报告 changed、removed 及 recoveryPath |
| PROJECT_IO_FAILED / FILE_READ_FAILED / FILE_WRITE_FAILED | 文件系统操作失败 |

remove 在项目根卡不存在时成功返回无变化，不删除无根卡的资料目录。已有根卡损坏时操作失败；不通过删除绕过无法核实的输入。清理失败时先检查 recoveryPath，不能把失败响应当成“什么都没发生”后盲目重试。

## 文件影响与并发

list/read/check 自身只读。修改类真实调用使用 `.agents/runtime-data/projects/write.lock`，与能力对象锁独立；读和预览不获取该锁。根卡写入和删除同时使用 metadata 文件锁，与通用 metadata 写入互斥。锁不自动根据 PID 删除，遗留锁需先核对。

已有根卡更新复用 metadata 的原子替换与发布前字节、文件身份检查；新根卡写到临时文件后以不覆盖方式发布，并保留原目录资源。删除前复核整个项目目录的内容，再重命名到 `.ksf-project-deleting-<随机值>` 后清理；清理失败保留恢复路径，隐藏临时目录不进入项目集合。

检查和锁保护命令执行期间的变更，不提供上一次 read 与后一次 write 之间的版本令牌；提交完整 body 前仍需由 Agent 核对来源和最新内容。单项目操作不构成跨文件、跨项目或外部工程事务。通用宿主编辑工具不受项目锁强制约束，故发布前仍进行比较。

启动准备可能更新 `.agents/runtime-data/runtime/`，所以命令自身只读或预览不保证整个启动流程零写入。运行依赖保持随包 Node.js，不依赖 Python 或全局 Node。

## 实现与验证

- [命令适配](../../runtime/src/commands/projects.js)：参数、帮助、文本与 JSON、退出码。
- [项目服务](../../runtime/src/services/projects.js)：发现、格式复用、写入、锁和目录删除。
- [服务测试](../../runtime/tests/projects.test.js)与 [CLI 测试](../../runtime/tests/projects-cli.test.js)：创建更新、无元数据、中文名称、预览、部分失败、字节保留、路径隔离、冲突、清理失败和跨 cwd 调用。

实际测试通过范围见本次 `ksf test` 输出；自动化使用隔离临时项目，不修改正式用户项目。返回[索引](index.md)。
