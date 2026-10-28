# 四类对象命令公共规则

已实现。适用于 `cooperation`、`partner`、`competency`、`data-package`。CLI 只适配类型、参数和输出，共享目录、契约、解析和写入服务；不启动 Agent 或执行对象正文中的操作。对象概念见[对象综述](../objects/overview.md)，公共字段见[对象元数据规范](../对象元数据规范.md)，命令设计遵循[统一规范](../CLI命令设计规范.md)。

## 命令与参数

```sh
ksf <类型> list [--source effective|system|user|all|源ID] [--json]
ksf <类型> read <id[@version]> [--part metadata|body|all] [--source effective|system|user|源ID] [--json]
ksf <类型> check <id[@version]> [--source effective|system|user|源ID] [--json]
ksf <类型> write <id> (--data JSON | --from 文件) [--dry-run] [--json]
ksf <类型> remove <id> [--dry-run] [--json]
```

示例中的 ksf 指 `.agents/ksf`，不表示已安装全局命令。支持类型级、操作级 `--help`/`-h`。操作后的选项可以调整顺序，`--` 结束选项；未知、重复、缺值、互斥及当前操作不支持的选项均报错。不保留旧操作或别名。

| 参数 | 类型、默认与限制 |
| --- | --- |
| `id` / `id@version` | 单个位置参数；类型须与命令一致，write/remove 只接受无版本 ID |
| `--source` | 单值单次，默认 effective；all 仅 list 接受；写操作不接受来源选择 |
| `--part` | 单值单次，仅 read；默认 all，metadata/body/all |
| `--data` | 单次 JSON 对象输入，与 --from 必须且只能提供一个 |
| `--from` | 单次输入文件；相对 KSF 根目录，绝对路径直接使用；UTF-8 JSON，不能是符号链接 |
| `--dry-run` | 无值，仅 write/remove；检查并表达拟定操作，不发布业务变化、不取得对象写锁 |
| `--json` | 无值；切换结果格式，不改变业务动作 |
| `--help` / `-h` | 无值；单独用于当前命令/操作，不与目标或其他选项组合 |

## 列举与解析

每次直接扫描当前文件，没有持久化索引。递归寻找对应入口；识别对象承载目录后停止把其内部资源识别为对象。`.upstream/`、内部暂存和删除恢复目录排除，符号链接不跟随。空目录正常返回空集合；缺失、不可读、错误入口或损坏元数据报告错误。结果按 ID、来源、路径稳定排序。

未发行的 Core 源码包含 `.agents/core/build.json`、`.agents/core/distribution.json`，没有 `.agents/core/release.json` 和根 `ksf` 启动器。此时尚未创建的用户能力目录视为空范围，查询不创建目录。系统目录仍须完整；发行工作区的用户目录缺失、任何范围不可读或包含符号链接仍报告错误。

默认有效来源：个人、匹配能力源、系统；用户 draft/active 接管；用户 archived 退出；精确版本先找匹配个人版，再找唯一匹配的能力源版，最后找匹配系统版。多个源匹配时明确选择来源，不自动选最新版。不支持自动选最新版。显式 system/user 只读指定区，可读归档定义。坏的未归档用户副本不静默回退。同区重复身份冲突；跨区同 ID 允许接管。

draft 保存后立即影响默认读取和依赖解析；首次派生默认就是 draft。active 不另设启用门禁，也不表示质量通过。需要先讨论而不生效的候选留在任务材料中；需要保留现有副本但退出默认选择时显式归档。完整语义见[用户接管与修订](../对象元数据规范.md#用户接管与修订)。

固定对象只认指定系统定义：

| ID | 指定路径 |
| --- | --- |
| `cooperation.ksf.entry` | `AGENTS.md` |
| `partner.ksf.runtime` | `.agents/core/abilities/partners/ksf-runtime/partner.md` |
| `competency.ksf.ability-route` | `.agents/core/abilities/competencies/ability-route/competency.md` |
| `competency.ksf.project-route` | `.agents/core/abilities/competencies/project-route/competency.md` |
| `competency.ksf.asset-maintenance` | `.agents/core/abilities/competencies/asset-maintenance/competency.md` |

list 是对象管理清单，包含固定定义并标注 protected；路由从中排除固定入口链。list --source all 展示全部来源实际有效定义和 effective 标记；无效项通过 errors 报告，不能冒充可调用对象。部分失败仍返回可核实项，complete=false、ok=false、退出 1；不完整集合不能证明“全库无匹配”。

## 读取与检查

read 返回入口选定部分：metadata 只包含 metadata 映射；body 只包含正文；all 两者都有。三种模式都保留 id/source/path/directory/version/user_revision/protected 定位信息及 definition_digest（入口文件原始字节的 SHA-256），未选择字段不输出。摘要供[路由上报](route.md)核对，不代表已读全部资源或已采用方法。不展开任何参考资料、模板、基线或程序；read 返回 references 的解析定位，不加载引用正文。

check 检查公共字段、类型与存储位置、同区重复身份、声明精确依赖的本地解析，以及所选用户派生基线的完整性。返回 valid、checkedPaths 与 references。检查不评价专业质量、不自动修复，也不证明基本功中的操作或支持程序已被执行。

对象路径相对 KSF 根目录；引用绑定同时记录 source/path，后续按相应对象命令读取。正文中的参考链接只作为资源入口，不能用旧系统路径绕过有效对象解析。

## 写入与修订

输入结构：

```json
{"metadata":{"description":"新的摘要"},"body":"# 新的正文\n"}
```

metadata 或 body 可以省略，省略部分保持原样；metadata 顶层合并，字段值整体替换，null 是赋值。空对象对既有用户定义无变化；只有系统版时即使输入为空，也执行完整目录派生。新用户原创必须具备公共字段和非空正文，id 可以由目标参数提供；写入后的正文必须非空。

已有用户副本继续更新；只有系统定义时派生完整目录；两区都不存在时新建用户对象。不能改变 ID、显式指定 user_revision/upstream 或以普通 write 更换派生来源版本。用户原创可显式改变 version。初次派生默认 draft，修订 1；实际正文、元数据或状态变化才递增，无变化不重写。

系统与用户同 ID 以状态自动接管，无需另存运行时选择表：

```sh
.agents/ksf partner write partner.ksf.object-designer --data '{"metadata":{"description":"我的对象设计协作方式"}}' --dry-run --json
.agents/ksf partner write partner.ksf.object-designer --data '{"metadata":{"status":"archived"}}' --json
.agents/ksf partner write partner.ksf.object-designer --data '{"metadata":{"status":"active"}}' --json
```

上例预览不会实际派生；之后的实际 write 才创建或修改用户定义。派生时完整保存入口、程序、模板、二进制资源和空目录；原始快照与来源摘要位于用户目录 .upstream/，入口内受管 upstream 映射记录 id/version；丢失基线时不能被当成用户原创继续更新。不支持的目录项导致整个操作失败，不能静默漏文件。

## 删除、发布与并发

remove 物理删除整个用户目录，包括所有附件和基线。没有用户定义时报不存在；不会删除系统版。删除后有合适系统版本则回退。需要保留定制内容时用 write 将 status 改为 archived。

写操作在发布前检查受影响的声明引用；原本能解析的精确引用若将失效则停止。系统回退版本满足要求时允许删除或归档。未知引用、损坏目录或身份冲突不能通过静默降级避开；首版修改前要求其余对象目录无错误。

对象写操作共用 `.agents/runtime-data/objects/write.lock`，不自动抢占或清理别人的遗留锁。创建和派生通过目标父目录下完整暂存目录发布；入口更新复用 metadata 的同目录临时文件、同步、原子替换与权限保留。发布前复核目录资源、入口和目录清单。锁协调 KSF 对象写入，不能阻止外部编辑器；检测并发变化时停止。

删除先原子移动到隐藏 `.ksf-object-deleting-*` 再清理。清理失败返回 changed=true、removedFromCatalog=true 和 recoveryPath，保留可恢复信息；不能盲目重试当作尚未删除。失败的创建或派生清理暂存目录。预览不创建目标目录、锁、临时文件或基线；共同启动层仍可能准备 Node。

## 结果与错误

业务文本和 JSON 都输出 stdout，诊断及启动日志输出 stderr。JSON 为：

```json
{"ok":true,"command":"partner","operation":"list","data":{"complete":true,"scopes":[],"objects":[]},"errors":[]}
```

| 操作 | data 核心字段 |
| --- | --- |
| list | complete、scopes、objects；各摘要包含身份、name/description/status、来源、版本、修订、入口与目录、protected/effective |
| read | object（定位与选定内容）、references（引用及实际绑定或错误） |
| check | id、valid、可解析时的 object 摘要、checkedPaths、references |
| write | id/source/path/directory、dryRun/changed/created/derived、version/user_revision |
| remove | id/source/directory、dryRun/changed/removedFromCatalog |

预览 changed=false，其他字段表达拟定结果；比如 user_revision 是预计发布后的修订，并不代表已经保存。普通无变化也 changed=false。失败不能读取猜测对象；明确可用的部分检查/读取结果通过 data 保留。

退出码 0 成功或无变化，1 执行/契约/引用/并发失败，2 调用或 JSON 输入格式错误。错误项包含 code/message 及必要定位。常用对象错误：OBJECT_NOT_FOUND、OBJECT_VERSION_MISMATCH、OBJECT_ID_CONFLICT、OBJECT_INVALID、OBJECT_PROTECTED、OBJECT_SCOPE_INCOMPLETE、OBJECT_DEPENDENCY_INVALID、OBJECT_DEPENDENTS_BLOCKED、OBJECT_MANAGED_FIELD、OBJECT_ID_IMMUTABLE、OBJECT_BASE_VERSION_IMMUTABLE、OBJECT_BASELINE_INVALID、OBJECT_LOCKED、OBJECT_CONFLICT、OBJECT_RESOURCE_UNSUPPORTED、OBJECT_CLEANUP_FAILED。底层 YAML、编码和文件错误沿用 metadata 错误码；错误不回显私人正文。

## 实现与验证

命令适配在 `runtime/src/commands/objects.js`，服务在 `runtime/src/services/objects.js`，共享 schema/catalog/storage 在 `runtime/src/objects/`。复用 metadata 的 JSON、frontmatter 和文件模块，没有第二套 YAML 引擎。

测试见 [objects.test.js](../../runtime/tests/objects.test.js) 和 [objects-cli.test.js](../../runtime/tests/objects-cli.test.js)：覆盖四类生命周期、读取模式、接管/版本、完整派生、基线、相对链接、引用保护、固定入口、锁、并发及失败清理；真实启动入口结果需与测试报告分别记录。资源监控、自动合并、远程获取、多版本和前端升级不在首版范围。

首版实际测试、真实入口调用与路由走查证据见[验证记录](objects-validation.md)。

## 已关联能力源

能力源对象是直接读取的独立仓库内容，路径为实际绝对路径，返回 source 为源 ID、source_root 为仓库根。显式 --source <源ID> 只查询该源；all 列举所有来源。源内依赖在本源/Core 精确绑定，后续按 references 返回的 source 显式读取。SOURCE_AMBIGUOUS 携带候选源，失联和损坏返回不完整结果。write/remove 仍只操作个人区，不会修改或自动派生能力源对象。协议与发布见[能力源](../sources.md)。
