# metadata 命令规则

设计与后续扩展统一遵循 [CLI 命令设计规范](../CLI命令设计规范.md)。已实现行为与待实现接口分别标注。

## 文档状态

本文件记录 `ksf metadata` 的职责、命令设计与读写要求。定位依据当前讨论：管理任意 Markdown 文件的 YAML frontmatter，而不是只管理 KSF 对象入口。

read、write、remove、check 已实现，使用随包 Node.js 运行。本文记录首版接口与支持边界；验证结果以实际测试和调用记录为准。当前全部命令见 [CLI 能力说明](overview.md)。

## 定位与适用范围

`ksf metadata` 提供通用 Markdown 元数据处理能力，支持读取、写入、移除字段或整个元数据块，以及结构检查。

- 目标文件可以是普通笔记、项目资料、对象入口或其他 Markdown 文件，不要求位于能力目录或具有对象身份。
- 元数据指文件开头的 YAML frontmatter；正文中的代码块、表格或后续分隔线不作为元数据处理。
- 不要求存在 `id`、`name`、`status`、`description`、`version` 等业务字段。
- 不推断对象类型，不自动填充版本、推进状态、迁移 ID 或同步其他文件的引用。
- 管理任意 Markdown 表示内容类型通用，不扩大调用方已有的文件读写权限。

## 与上层对象管理的关系

| 层次 | 职责 |
| --- | --- |
| 元数据处理 | YAML 解析、字段读写、结构检查、变更预览与文件更新 |
| 对象管理 | 使用元数据处理模块，按对象公共规范及各类型业务规则检查或修改对象 |
| 能力发现 | 使用对象服务，汇总对象摘要、来源和入口，不把任意带 frontmatter 的文件当作对象 |

[对象元数据规范](../对象元数据规范.md)由对象管理层使用，不硬编码到通用元数据模块。

例如：元数据层可以保存一个 `references` 字段；该字段是否符合 `id@version`、目标是否存在、版本是否匹配，属于上层规则。元数据层可以修改 `status` 字段，但这不证明对象已完成合法的状态转换。直接修改 ID 也不代表已经完成引用迁移。

## 命令结构与操作

统一采用 `ksf metadata <操作> <文件> [选项]`。标准操作为 read、write、remove、check，旧 get/init/set/unset/patch/validate 草案不作为别名保留。

| 操作 | 能力 | 默认与边界 |
| --- | --- | --- |
| `read` | 读取全部或指定字段 | 未指定字段时读全部；--fields 后接一个或多个字段名 |
| `write` | 写入一个或多个字段 | 没有 frontmatter 时创建，已有时只更新提供的字段，其他字段保留 |
| `remove` | 删除指定字段或整个元数据块 | 必须指定 --fields 或 --all，二者互斥；不删除文件及正文 |
| `check` | 检查 YAML 和字段映射结构 | 不修改文件，不检查对象业务规则 |

### 参数

目标文件必填，接受现有 Markdown 文件路径；相对路径按启动入口定位的 KSF 根目录解析。不存在的文件不由本命令自动创建。

| 参数 | 类型与范围 | 必填、默认及约束 |
| --- | --- | --- |
| `--fields <名称...>` | 完整顶层字段名列表；read/remove | 选项只出现一次，后接至少一个空格分隔的字段名；重复字段按首次顺序去重，不按逗号或点号拆分 |
| `--data <JSON>` | 字段映射；write | 与 --from 恰选其一；顶层必须为对象 |
| `--from <文件>` | 包含 JSON 字段映射的文件；write | 相对 KSF 根目录；与 --data 互斥、语义一致 |
| `--all` | 布尔选项；remove | 移除当前文件整个元数据块，与 --fields 互斥 |
| `--json` | 布尔选项；四种操作 | 默认可读文本，只改变输出格式 |
| `--dry-run` | 布尔选项；write/remove | 默认实际执行；启用时预览，不修改目标 |
| `--help`、`-h` | 帮助选项 | 提供命令及操作帮助，不与目标或其他选项组合 |

未支持的参数及不允许的重复选项应报错。--fields 不重复出现；字段列表遇到下一个选项或选项结束符 -- 时结束，未提供字段名时报参数错误。含空格的字段名用 shell 引号包裹，仍作为一个完整名称处理。首版不默认等待标准输入，也不提供多文件批处理。

### 调用示例

以下从仓库根目录通过程序入口调用；在其他目录使用入口的绝对路径，文件参数仍基于 KSF 根目录：

```sh
.agents/bin/ksf metadata read notes.md --json
.agents/bin/ksf metadata read notes.md --fields title
.agents/bin/ksf metadata read notes.md --fields title tags --json
.agents/bin/ksf metadata read notes.md --fields "display name" tags
.agents/bin/ksf metadata write notes.md --data '{"title":"设计笔记"}'
.agents/bin/ksf metadata write notes.md --data '{"title":"设计笔记","tags":["KSF"],"published":false}'
.agents/bin/ksf metadata write notes.md --from metadata.json --dry-run
.agents/bin/ksf metadata remove notes.md --fields obsolete
.agents/bin/ksf metadata remove notes.md --fields obsolete draft --json
.agents/bin/ksf metadata remove notes.md --all
.agents/bin/ksf metadata check notes.md --json
```

### 更新与删除语义

write 合并提供的顶层字段，每个字段的值整体替换。列表不自动追加，嵌套映射不隐式深度合并；null 是保存的值，不代表删除。首次写入与单字段、多字段更新使用同一操作。

remove 的多个字段一次性写入；不存在的字段不报错，结果区分“已删除”和“原本不存在”。--all 只移除当前文件的 frontmatter。

补充边界：

- read 选择不存在的字段时，成功返回实际存在的字段，并单独列出缺失字段；不将缺失字段填为 null。
- write 输入空对象 `{}` 时成功但无变化，即使尚无元数据块也不创建空块。
- write 提供的值与现有值相同时，不重新保存文件，不仅为重新排版而修改内容。值和类型均参与比较；映射键顺序不影响相等，列表顺序影响相等。
- remove 删除最后一个字段时保留空元数据块；只有 --all 移除整个块。
- remove --all 遇到损坏或无法可靠识别的 frontmatter 时也报错，不猜测范围或删除正文。
- 多字段操作先完成解析与检查，失败不保存任何部分结果。

## 文件状态与操作行为

任意 Markdown 都可以没有元数据；“未设置”是正常状态。对象层需要元数据时自行应用对象契约。

| 文件状态 | read | write | remove | check |
| --- | --- | --- | --- | --- |
| 没有元数据块 | 成功，返回未设置 | 非空输入时添加元数据块；空对象不修改 | 成功，无变化 | 成功，返回未设置 |
| 元数据块为空 | 成功，返回空映射 | 写入指定字段 | 按字段或 --all 处理 | 成功，结构合法 |
| 元数据合法 | 返回全部或指定字段 | 更新提供的字段 | 删除指定字段或整个块 | 成功，结构合法 |
| 元数据损坏或结构不合要求 | 报错 | 报错，不修改 | 报错，不修改 | 返回具体问题，检查不通过 |
| 文件不存在或不可读 | 报错 | 报错，不创建文件 | 报错 | 报错 |

只包含空白或注释的元数据块按空映射处理；没有实际修改时保留原样，实际写入时尽量保留注释。显式以 null、列表或标量作为顶层的元数据不符合字段映射要求，与空块区分。

文件读取失败时不能判断元数据状态，不将其归为“未设置”或“元数据损坏”。文件不可写、输入文件读取失败及发布失败按实际操作阶段报告，不虚构成功结果。

## 数据类型与结构检查

元数据支持字符串、数字、布尔值、`null`、列表和嵌套映射。写入与读取保留值的类型，不因字段名称猜测业务含义。

需要区分以下情况：

- 没有 frontmatter：元数据未设置，不等同于 YAML 损坏。
- 有合法的字段映射：可以读取与编辑，不要求任何特定业务字段。
- 缺少某个字段：字段不存在，不等同于其值为 `null`、空字符串或空列表。
- YAML 语法损坏、重复键或顶层不是字段映射：报告结构问题，不悄悄选择某个值或覆盖原始内容。

`check` 的结论只覆盖元数据结构。它不验证字段表达的事实是否正确，也不证明文件是合法对象或对象具备执行条件。

未知字段是合法的通用字段，不能因为程序不认识就删除。首版按完整顶层字段名选择，点号与逗号不拆分。嵌套值整体读写，更细粒度的嵌套寻址与列表元素操作不属于当前接口。

## 写入与预览要求

1. **正文保真**：只修改 frontmatter，已有正文保持原始字节不变；不得借元数据修改重排正文或统一正文换行。
2. **最小改动**：尽量保留注释、未修改字段的顺序和原有 YAML 写法。保留注释、字段顺序和标量风格，但 YAML 序列化可能调整空白；不承诺整个元数据块逐字节不变。
3. **预览**：写操作支持 `--dry-run`，呈现拟定变更与检查结果，不写入目标文件。
4. **整体更新**：计算并检查完整变更后一次发布；解析、校验或写入失败时，不留下部分字段已修改的结果。
5. **并发检查**：写入前检查文件是否自读取后发生变化；发现冲突时报告并停止覆盖。
6. **原子写入**：采用原子替换等文件更新机制，具体实现同时考虑原文件权限、失败清理与平台支持。
7. **业务中立**：可以编辑结构合法但不符合对象规范的元数据；上层对象命令负责自己的校验与写入门禁。

支持 UTF-8 Markdown，保留已有 BOM 和正文原始字节。元数据序列化沿用文件第一个换行符的风格，文件没有换行时使用 LF；正文自身不转换换行。新增块插入在 BOM 后、原正文前。现有开始行与结束行保持原样。

实际修改在目标目录使用按规范化目标路径生成的排他锁（`.ksf-metadata-<摘要>.lock`），在锁内读取、计算及发布。锁被占用或遗留时返回 FILE_LOCKED，不自动抢锁。预览不创建该锁或临时文件。

写入同目录独占临时文件，保留原 POSIX 权限位，执行文件同步后复核原文件内容、身份与属性，再原子替换；失败清理临时文件。锁协调 KSF 写操作，不能阻止外部编辑器在复核与替换之间竞争；也不承诺跨机器文件系统上的事务隔离。异常退出遗留锁需先核实其拥有者，再人工清理。

首版不跟随目标文件本身的符号链接，不替换链接或写其目标；目录路径经系统解析。硬链接身份、所有权、ACL 和扩展属性不在本版保真承诺内。锁清理失败作为 stderr 诊断，不把已经成功发布的操作误报为未修改。

以上描述命令自身的文件影响。现有 CLI 共同启动层可能准备或修复 `.agents/runtime-data/runtime/`；`--dry-run` 不应被解释为整个启动过程绝对零写入。

## 模块职责

| 模块 | 负责内容 |
| --- | --- |
| 文档解析 | 识别 frontmatter 边界、解析 YAML、保存正文及格式信息 |
| 结构检查 | 检查映射结构、重复键及通用数据类型，不引用对象业务规范 |
| 元数据变更 | 根据操作产生新值、删除项、差异和结构检查结果 |
| 文件读写 | 读取文件、检测并发修改、保留正文、发布变更与处理失败 |
| CLI 适配 | 参数解析、输入输出、错误呈现及退出码 |

对象命令和其他接口直接复用这些模块，不通过启动 `ksf metadata` 子进程再解析输出，不各自维护另一套 YAML 修改逻辑。

## 输出与结果字段

提供可读文本与 `--json`，两者表达同一结果；不默认返回 Markdown 正文。JSON 使用统一规范的 `ok`、`command`、`operation`、`data`、`errors` 外层，command 固定为 metadata，operation 为当前操作名。

data 字段如下：

| 操作 | 字段 | 含义 |
| --- | --- | --- |
| 所有操作 | `target` | 按 KSF 根目录解析后的绝对目标路径；目标本身为符号链接时拒绝处理 |
| read/check | `state` | absent、present 或 invalid；无法读取时不虚构状态 |
| read | `values` | 已读取的字段映射；没有元数据或选定字段全部缺失时为空映射 |
| read/remove | `missingFields` | 本次明确选择但原本不存在的字段，按选择顺序排列；未选择字段或 --all 时为空列表 |
| write/remove | `beforeState`、`afterState` | 操作前状态及计算后的目标状态；预览时 afterState 表示拟定状态，不声称已经发布 |
| write/remove | `dryRun` | 是否为预览 |
| write/remove | `changed` | 目标文件是否实际修改；预览、失败或无变化时为 false |
| write/remove | `changes` | 计算出的字段新增、更新、删除及前后值；预览时为拟定变化，无字段变化时为空列表 |
| check | `valid` | 未设置元数据为 null；结构合法为 true；结构不合要求为 false |

state 的含义：absent 表示没有元数据块；present 表示有结构合法的字段映射，空映射也属于 present；invalid 表示已识别的 frontmatter 损坏或结构不合要求。

changes 只表达字段变化，整个元数据块的增删通过 beforeState 与 afterState 表达。因此删除一个空块可以是 changed 为 true、changes 为空列表。每个变化项包含 type（added、updated、removed）、field、before、after。before/after 均包含 exists；为 true 时附 value，为 false 时不附 value。因此字段缺失与显式 null 不混淆。例如新增字段为 `{"type":"added","field":"title","before":{"exists":false},"after":{"exists":true,"value":"设计笔记"}}`。

check 在 absent 状态下返回 ok 为 true、valid 为 null、退出码 0；invalid 状态下返回 ok 为 false、valid 为 false、退出码 1，具体问题放入 errors。read 在损坏状态下不返回猜测的部分字段值。

若未能读取文件或完成解析与计算，只返回已经确认的定位信息或 data 为 null；不要伪造 values、状态或拟定变化。失败结果即使保留诊断或计算信息，也不能声称已经写入；结果不明时先核对文件再重试。

### JSON 示例：读取存在与缺失的字段

假设 title 已设置为“设计笔记”，tags 不存在，读取两者的结果为：

```json
{
  "ok": true,
  "command": "metadata",
  "operation": "read",
  "data": {
    "target": "/path/to/note.md",
    "state": "present",
    "values": {
      "title": "设计笔记"
    },
    "missingFields": ["tags"]
  },
  "errors": []
}
```

### JSON 示例：检查尚未设置元数据的文件

```json
{
  "ok": true,
  "command": "metadata",
  "operation": "check",
  "data": {
    "target": "/path/to/note.md",
    "state": "absent",
    "valid": null
  },
  "errors": []
}
```

上述路径是占位示例。没有元数据不等于已检查并满足某类对象要求。

## 错误与退出码

| 类别 | 情况 | 退出码 |
| --- | --- | --- |
| 调用错误 | 缺少目标、参数互斥、未知参数、不允许的重复选项、输入 JSON 无法解析或顶层不是对象 | 2 |
| 内容错误 | frontmatter 未闭合、YAML 损坏、重复键、顶层不是字段映射 | 1 |
| 文件错误 | 文件不存在、输入或目标文件不可读、目标不可写、并发修改、发布失败 | 1 |
| 正常结果 | 成功读写或检查、未设置、字段不存在、没有变化 | 0 |

错误项遵循统一规范，提供稳定 code 与 message，按需附 target、field、行列位置。YAML 诊断位置使用目标文档的 1 起算行列，包含 frontmatter 开始行，列按 Unicode 码点计数；错误不输出整份私人文档。

不支持的 YAML 特性返回 YAML_UNSUPPORTED，不展开或静默转换。解析器自身拒绝的语法仍报告 YAML_INVALID。

业务结果写入 stdout，日志与启动层诊断写入 stderr。进入 metadata 处理器后，--json 的失败也使用统一结果结构；启动层失败仍可能只有 stderr 文本。

## 验证要求

后续实现至少覆盖：

- 普通笔记没有任何 KSF 对象字段，也能完成元数据读写。
- 无 frontmatter、空映射、字段缺失和显式 null 能够区分。
- 仅空白或注释的块按空映射处理；显式 null、列表或标量顶层检查不通过。
- 无元数据时 read/remove/check 正常返回，check 的 valid 为 null；read 的缺失字段不填为 null。
- 中文、多行文本、引号、数字、布尔值、列表及嵌套映射往返后类型和值正确。
- 正文中的分隔线或 YAML 代码块不会被当作元数据。
- 重复键、损坏 YAML 和非映射顶层给出明确诊断，原文件保持不变。
- write 首次添加 frontmatter，后续保留未指定字段；列表和嵌套值整体替换，多字段更新不部分落盘。
- write 空对象与重复写入相同值均不修改文件；元数据尚不存在时空输入不创建块。
- --fields 覆盖单值、多值、含空格字段名、重复字段去重、缺少值及重复选项报错；字段列表在下一个选项前正确结束。
- remove 覆盖单字段、多字段、字段不存在、--all 及互斥参数；移除元数据块后正文保持原样。
- 删除最后一个字段保留空块；--all 可以移除合法空块，遇到损坏内容仍报错。
- `--dry-run` 不修改目标文件；并发冲突不覆盖他人改动。
- 预览时 changed 为 false，changes 表达拟定字段变化，afterState 不冒充已发布状态。
- 正常、无变化、内容错误、文件错误和调用错误的结果结构与退出码符合约定。
- 正文逐字节一致，未修改字段及注释的保留程度符合最终约定。
- 使用对象必需字段名不会触发对象业务规则；对象层校验另行验证。

测试实现见 [metadata 单元与文件测试](../../runtime/tests/metadata.test.js) 和 [metadata CLI 测试](../../runtime/tests/metadata-cli.test.js)。测试通过与真实调用结果分别报告，不等同于长期使用效果。

## 首版格式支持与错误码

- 开头可有 UTF-8 BOM，随后必须是独立 `---` 行才识别为 frontmatter；结束行为独立 `---` 或 `...`。标记行不接受行尾空格；文件开头没有标记则为 absent。已识别开始但未闭合时报错。
- 空白或注释块按空映射处理，显式 null、列表或标量顶层不合法。正文中的标记与代码块不作为元数据。
- 使用随源码分发的 yaml@2.9.0，YAML 1.2 Core。日期文本为字符串，普通 aliases/topics 等字段按字符串列表正常处理。
- 支持字符串、有限数字、布尔值、null、列表与字符串键映射；超出 JavaScript 安全整数范围的整数、非有限数字和非字符串映射键被拒绝。
- 锚点、YAML 别名及自定义标签首版不支持；普通 aliases 字段不属于 YAML 别名语法。保留原始值、不执行自定义构造器。
- write/remove 成功前重新解析新生成的元数据并核对值与类型；remove --all 直接保留原正文。若正文移到文件开头后恰以元数据标记开头，后续独立读取会按新文件内容识别，命令不为避免这种情况而改写正文。

| 错误码 | 含义 | 退出码 |
| --- | --- | --- |
| INVALID_ARGUMENTS | 操作、参数、重复或互斥关系错误 | 2 |
| INPUT_INVALID | JSON 无法解析、顶层非映射或包含不安全数字 | 2 |
| FILE_NOT_FOUND | 输入文件、目标或父目录不存在 | 1 |
| FILE_READ_FAILED | 文件无法读取 | 1 |
| FILE_UNSUPPORTED | 目标不是普通文件或目标本身是符号链接 | 1 |
| ENCODING_INVALID | 非有效 UTF-8 | 1 |
| FRONTMATTER_UNCLOSED | 开始标记没有对应结束标记 | 1 |
| YAML_INVALID | YAML 语法损坏 | 1 |
| YAML_DUPLICATE_KEY | YAML 映射中出现重复键 | 1 |
| YAML_UNSUPPORTED | 超出首版 YAML 特性或数值范围 | 1 |
| METADATA_STRUCTURE_INVALID | 顶层非映射或键非字符串 | 1 |
| FILE_LOCKED | 写锁被占用或遗留 | 1 |
| FILE_CONFLICT | 文件在读取或发布前发生变化 | 1 |
| FILE_WRITE_FAILED | 临时文件准备、同步或发布失败 | 1 |
| SERIALIZATION_FAILED | 生成结果与请求值或类型不一致 | 1 |
| METADATA_FAILED | 未预期的处理失败，返回简短诊断 | 1 |

FILE_LOCK_CLEANUP 是 stderr 清理诊断，不伪造业务错误码或撤销已发布结果。首次完整执行成功后再收到异常中断时，应先核对文件，不把没有收到结果自动当作未写入。

## 实现入口与后续范围

- [命令适配](../../runtime/src/commands/metadata.js)：参数、帮助、文本与 JSON 结果。
- [业务服务](../../runtime/src/services/metadata.js)：字段操作、差异和无变化判断。
- [frontmatter 模块](../../runtime/src/metadata/frontmatter.js)：YAML 文档解析与生成。
- [文件发布模块](../../runtime/src/metadata/files.js)：读取、排他锁、并发检查和原子替换。
- [第三方版本及文件摘要](../../runtime/src/vendor/yaml/PROVENANCE.json)与 [ISC 许可证](../../runtime/src/vendor/yaml/LICENSE)。运行不依赖全局 Node、npm 安装或联网下载。

更细粒度嵌套字段操作、多文件批处理、YAML 高级特性、自动恢复遗留锁和完整文件元信息保真不属于首版。对象状态、版本、引用与迁移规则由对象层定义。

## 首版验证记录

2026-10-15，在 macOS ARM64、随包 Node.js v24.21.0 上完成：

- `.agents/bin/ksf test`：78/78 通过，包含原有回归及 metadata 单元、文件发布、跨进程锁和 CLI 测试。
- 真实 `.agents/bin/ksf metadata` 入口共 12 次调用：临时文件上验证预览、写入、读取、检查、多字段删除和整块移除；从其他工作目录调用，确认目标及 --from 相对路径基于 KSF 根。
- 临时文件的 BOM 与正文原始字节保留；两份现有普通笔记仅执行检查和读取，操作前后内容哈希一致。
- `.agents/bin/ksf runtime verify --json`：通过。

这些结果覆盖本机首版行为，不代表其他平台或长期使用已验证。测试数据在独立临时目录中创建并清理。
