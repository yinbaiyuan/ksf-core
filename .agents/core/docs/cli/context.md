# context 命令

固定入口另提供 `ksf context entry --json`，按实例孵化状态返回完整 Core 工作要求，不启动后台或初始化状态；详见[孵化接口](incubation.md)。下文 capabilities 契约保持不变。

入口、按需路由、工作绑定、增量确认与压缩恢复的完整连接见[Runtime与上下文完整机制](../runtime/work-context.md)；本页说明各context操作的程序契约。

## 状态与职责

已实现 `capabilities`。为 Agent 组织当前 KSF 的完整有效 Cooperation、Partner 发现信息，输出先协同组、后搭档组；排列不是实际选择顺序。复用对象服务的有效列表查询，用户接管、归档回退、冲突及固定入口保护均由对象层处理，不维护第二套扫描或 YAML 解析逻辑，不启动对象 CLI 子进程。

描述由对象作者维护，程序忠实取得 `description`，不补写、改写、截断或评价其业务充分性。程序只组织数据；匹配、澄清和后续行动由 [ability-route](../../abilities/competencies/ability-route/competency.md) 与 Agent 判断。

## 调用与参数

从 KSF 根目录调用；其他工作目录使用入口绝对路径：

```sh
.agents/ksf context capabilities
.agents/ksf context capabilities --json
.agents/ksf context --help
.agents/ksf context capabilities --help
```

| 参数或操作 | 行为 |
| --- | --- |
| 无操作、`context --help`、`context -h` | 显示命令组帮助，不执行发现 |
| `capabilities` | 返回两类完整有效对象的发现描述，默认可读文本 |
| `capabilities --json` | 同一业务结果的 JSON 表达，无值且只能出现一次 |
| `capabilities --help`、`capabilities -h` | 显示操作帮助；不能与其他选项或目标组合 |

没有位置目标；支持 --source <源ID> 限定能力源范围，不提供其他对象过滤参数。未知操作、多余参数、重复选项、带值的无值选项及混用帮助均报调用错误。`--` 不引入额外目标或选项能力。未提供独立的 discover/catalog 命令或兼容别名。

## 有效范围与读取边界

直接使用现有 Cooperation、Partner 的默认有效列表，每次查询当前文件，没有持久化索引。对象层按公共规则处理系统、个人与已关联源定义、精确身份、状态与冲突；context 不按系统/用户分组，也不提供另选来源的规则。

结果保留固定根入口协同和入口搭档，并通过 `protected=true` 标明。ability-route 从下游候选中排除这些固定入口，按当前明确要求、有效原安排、适用项目预设及全局协同/搭档形成安排，再判断通用 Agent；context 不执行语义匹配或宣布选择成功。项目预设不会过滤此全局集合，显式配置来源只解析对应项；只有用户或已确认范围明确限定源时才使用 --source 范围查询，不把该范围冒充全局。

只输出选定的发现字段，不返回原始元数据映射、版本、修订、正文、声明依赖、基本功、数据包或附属资源。对象底层会读取并校验对象定义，读取不代表这些内容已进入 Agent 上下文，也不代表专业适用性已验证。候选正文继续通过对应对象 `read` 命令按需取得。

## 文本与 JSON

文本先显示总体完整性，再显示 Cooperations、Partners；各组标明 complete/incomplete，空组显示 `(empty)`。每项提供名称、ID、定义路径、固定入口标记和完整 description。原始描述保留首尾空白和换行，不缩写或增加业务解释。

JSON 沿用统一信封：

```json
{
  "ok": true,
  "command": "context",
  "operation": "capabilities",
  "data": {
    "complete": true,
    "cooperations": { "complete": true, "objects": [] },
    "partners": { "complete": true, "objects": [] }
  },
  "errors": []
}
```

两组 `objects` 中每项包含 `id`、`name`、`description`、`path`、`protected`、`source`；能力源对象还含 `source_root`。系统/个人 path 相对 KSF 根，源对象 path 为实际绝对路径。顺序沿用对象服务的稳定顺序，不按语义相似度排序，不静默裁减数量。

## 不完整结果与错误

分别取得两类结果，单组失败仍保留另一组及当前可核实对象。两组均完整才有总体 `complete=true`。空列表且完整表示范围内没有有效对象；不完整的空列表不能证明没有对象。

Core 源码仓库不要求创建用户能力目录，未创建的用户范围视为空集合；发行工作区缺失用户能力目录仍报告不完整。源码识别与扫描边界见[对象公共规则](objects.md)。

业务文本与 JSON（包括错误）输出 stdout，日志和启动错误输出 stderr。错误项包含 `code/message`、所属 `type` 及底层可提供的 ID、路径等定位信息；复用对象错误码，意外查询失败报告 `CONTEXT_QUERY_FAILED`，不回显对象正文。调用错误采用 `INVALID_ARGUMENTS`，data 为 null；尚未识别合法操作时 operation 为 null。

| 退出码 | 含义 |
| --- | --- |
| 0 | 完整成功，或正常显示帮助 |
| 1 | 不完整或执行失败，仍需读取 stdout 中的有效项与错误 |
| 2 | 操作、参数或调用格式错误 |

发现不完整时，Agent 可以继续核对不依赖缺失范围的候选，不能宣称已排除全库协同或直接据此决定不存在匹配。详细处理沿用 ability-route。启动层尚未进入业务处理器时可能只有 stderr，不保证业务 JSON 已产生。

## 文件影响、实现与验证

命令自身只读，不改对象、正文、索引、缓存或运行状态。共同 bootstrap 仍可能准备 `.agents/runtime-data/runtime/`。内部复用对象服务，不重新实现覆盖、校验或排序逻辑；对象范围与规则见[公共对象命令](objects.md)。

CLI 适配在 `runtime/src/commands/context.js`，组合服务在 `runtime/src/services/context.js`。测试见 [context.test.js](../../runtime/tests/context.test.js) 与 [context-cli.test.js](../../runtime/tests/context-cli.test.js)，覆盖摘要保真、有效覆盖、归档回退、固定入口、部分失败、帮助、参数、退出码、跨工作目录与只读行为。自动化测试与真实路由走查分别验收，不把结构成功当作业务匹配正确。

### 首次 context 命令验证（2026-10-15，macOS ARM64）

- 当时通过随包入口执行 `ksf test`，123 项全部通过，其中 context 新增 13 项；没有跳过或失败。四类能力模型调整后的回归见[对象验证记录](objects-validation.md)。
- 真实执行文本命令，并从其他工作目录执行 JSON 命令，均退出 0、complete=true。该次验证返回 1 个固定入口协同、2 个搭档，其中入口搭档为 protected；普通下游候选为 ksf能力管理搭档。
- 路由走查采用模拟输入“完善一个搭档的职责与基本功配置”。实际取得上述摘要，排除固定入口后没有普通协同，依据摘要选择能力管理搭档；实际通过 `partner read partner.ksf.ability-manager --part all --json` 读取正文，再按其精确声明读取 `competency.ksf.partner-design@0.1.0`，两次均退出 0、errors 为空。确认该任务属于搭档设计责任，下一步应取得目标搭档与实际问题，再按方法处理。
- 这是当前 Agent 的路由走查，使用了真实程序和正文读取；没有执行新的搭档设计任务，也没有独立会话、多 Agent 或长期效果验证。

工作上下文装配接口见下文；它只组合明确绑定的定义和文件，不提供语义调度、项目任务管理或全库资料检索。[最小运行闭环](../runtime/minimal-runtime.md)中的项目发现与根卡读取使用 [project CLI](project.md)，资料和知识仍按基本功按需读取，不是新增的 context 程序接口。

返回[命令索引](index.md)。

2026-10-16 重构后，当前完整发现为 1 个固定入口协同和 3 个搭档：runtime 固定保护，maintainer 与能力管理搭档为普通候选。真实 CLI 已核对 complete=true、errors=[]；维护角色可发现和派生，固定入口仍从下游候选排除。

## 能力源过滤

默认聚合个人、全部已关联源和系统的有效协同/搭档。--source <源ID> 则聚合个人、指定源和系统，保留个人优先与固定入口。每项新增 source，源对象还含 source_root 和实际绝对 path；description 仍原样提供。多源同 ID 歧义返回 SOURCE_AMBIGUOUS 和候选，按明确源重新发现，不按配置顺序猜测。详情见[能力源协议](../sources.md)。

未初始化的 Core 模板或原始更新包优先返回 mode=instance-setup，固定定义引导显式 instance init。入口本身只读本地状态，不联网查版本；成功初始化后重新取入口，再进入 incubation/runtime。正式 Core 源仓库依据自身 Git 根与官方 origin 识别，不在官方源上创建个人资料。

## 固定上下文与游离基本功查询

`context entry --json` 保留原data.entry的所选入口、原文、版本与SHA-256。正常模式使用 `protocol=ksf-entry-context-v3`，items只包含runtime的contentRef，expanded可选。v3沿用v2的入口/items布局，增加文件展开项；不恢复v1的五个固定items。初始化/孵化仍只提供其所选入口。

正常入口将Runtime交公共对象读取服务，沿references的标记深度优先展开。当前Runtime以 `#` 引用人设路由，以无前缀的精确引用保留能力/项目路由依赖；人设路由的 `+/USER.md`、`+/BOT.md` 将基础卡原文一并带出。正常基础集合为Runtime、人设路由、USER/BOT四项；能力/项目路由的正文由Runtime在使用前按需读取。程序不维护专业路由或人设文件加载名单，展开仍只由元数据标记决定，无前缀引用继续校验依赖。

`data.context.expanded` 的能力项保持 `{reference,object}`；文件项为 `{reference,kind:"file",file}`，file提供source/path、可选source_root、state、sha256、content。JSON/文本均完整传递内容。missing是明确缺失结果，原文/摘要为null，不初始化文件；不可读、编码无效、超限和符号链接等错误保留部分结果并使complete=false。调用方必须逐项核对state，不能以complete替代业务资料齐备判断。

人设路由核对并采用已展开的USER/BOT，避免重复读取。单独只读到路由主文、基础卡未提供或已知发生变化时，按方法使用 `config read collaboration.user/bot --json` 补读，新原文位于data.values.text，版本为etag。维护写入继续使用同一配置接口。方法已加载、资料已读、实际采用和业务执行分别表达；capabilities及orphan-competencies仍只提供发现摘要，文件不被当作能力候选或自动参与登记。

`context orphan-competencies [--source <源ID>] --json` 返回 `{complete,objects}` 与顶层 errors。候选为当前有效、未被任何有效搭档通过正式引用直接或间接关联的基本功，排除固定入口方法与匹配支持本身。每项含完整 description、精确来源、版本、路径和 definition_digest。查询只读、实时计算，没有持久候选索引；来源歧义或依赖损坏为不完整结果，退出 1。程序不判断语义适配，不动态改变引用。

`ability-manager migrate --dry-run --json` 预览旧对象设计师身份的当前设置、聊天状态和项目预设迁移；`--apply` 执行并保存原件备份。冲突保留双方，用户派生对象及外部来源需要单独核对，不伪造上游基线。历史回执、原始聊天和旧证据保留，读取投影显示当前身份关联。


## 当前工作与增量正文

`context work --json` 只读当前会话的绑定与 etag；`context bind (--from -|file | --data JSON) --if-match <etag|missing> --json` 更新唯一当前绑定，JSON null 清空。身份来自 CODEX_THREAD_ID，不来自 cwd。绑定复用 shared.json 的 `ksf.currentWork`，不创建原生轮次、不登记能力参与、不写项目进度。写入有结构与实际来源校验，带 etag 保留并发更新。

最小绑定示例（例中对象必须真实存在；采用实际版本与来源）：

```json
{
  "schemaVersion": 1,
  "goal": "完成当前开发任务",
  "status": "active",
  "ownership": {"state": "bound", "target": {"kind": "project", "name": "示例项目", "scope": "current"}},
  "executor": null,
  "methods": [],
  "files": [],
  "taskRef": "项目/示例项目/任务/当前任务.md"
}
```

executor/methods 使用 `{ref:"ID@精确版本",source:"实际来源"}`；bind 可以将 effective 定位为实际 source，之后不换源或换版本。能力类型的 ownership/relatedTargets 也在 bind 时解析为精确版本和实际来源；稳定 targetId 与 planned 定位保留原身份，读取旧绑定不隐式改写。files 每项为 `{path,purpose}`，path 是本 KSF 根下规范路径，可带一个逻辑 `/`；它不是操作系统绝对路径。taskRef 是同根任务文件路径。relatedTargets 可选，沿用六类目标定位格式；归属不等于执行能力或写入授权。目标根卡和任务记录不复制进绑定正文。

`context current --json` 返回完整 active、待补 pending、退出用途 retired、正文 bodies 与可选 delivery。基础集合来自现有 context entry 及标记展开，不维护路由或人设加载名单；工作集合来自绑定的执行能力、方法、主项目根卡、文件和 taskRef。`--manifest` 不返回正文或可确认 delivery。`--reload` 先换缓存代次，再提供当前需要的完整正文。初始化/孵化模式只装配当前所选入口，不提前执行旧工作绑定。

`context current --extras '<JSON数组>' --json` 增加本次调用的临时支持，每项为 `{ref:"ID@精确版本",source:"实际来源"}`，最多32项；与SDK的current extras共用校验、去重及展开。它不更新绑定，delivery保留同一extras供accept复核；后续不带该参数时退出turn-support用途，共同的executor/method/base用途仍保留。JSON损坏在reload前拒绝。示例中的引用只作格式说明，实际调用使用已读到的精确定位：

```sh
.agents/ksf context current --extras '[{"ref":"competency.example.review@1.0.0","source":"user"}]' --json
```

内容指纹包含实际来源、定位、版本和定义/文件摘要。输出只发送当前代次尚未确认读过的内容；变化项提供完整主文。missing 文件保留状态与 null 原文，不假装已读；不可读、编码、依赖及来源错误保留有效部分并使 complete=false。程序不追踪正文链接、不执行路由或采用动作。

完整读取本批清单和所有 bodies 后，将 data.delivery 原样通过 `context accept --from - --json` 提交。accept 重新核对绑定、代次、内容摘要及缓存版本，拒绝变化或迟到确认；失败/截断一批不更新缓存，允许重复读取。它只确认消费，不证明理解或永久保留。正常模式 entry 额外提供基础正文的 delivery，完整消费 entry/content 与 expanded 后可以确认；此确认不退出既有工作用途，也不重复发送基础正文。没有可核实会话身份时原 entry 契约仍可单独使用。

work、current及对象read保持只读；bind、accept、reset/--reload和hooks安装会写入状态。用户禁止写入时不执行这些写操作，正文可临时读取且不确认消费；缓存已有指纹但原文已不在上下文时，按active中的精确定位用对象read或原件读取取得正文。是否采用、持续绑定及何时恢复持久确认，由Runtime按实际授权决定。

缓存位于 `.agents/runtime-data/context/<chatId>.json`，只保存 generation、active、seen 指纹，不保存正文或事件流水。损坏/丢失重建，容量满时保留当前所需指纹并换代；业务绑定损坏则保留并报错。缓存不是原生参与台账，也不改变正式引用、依赖保护或游离基本功判定。

## 宿主与 SDK

`context hooks --json` 安装独立 UserPromptSubmit/SessionStart 短 Hook，保留其他 Hook。原生身份与本实例由现有转录适配核验；内置工作线程跳过。SessionStart 在 startup/resume/clear/compact/fork 时换代，再提供补读要求，不补造用户轮次。Hook 只提供有效清单与读取要求，不确认正文消费；短清单JSON上限6000字节，超过时明确要求显式读取完整清单；已受该严格预算限制的处理器使用 additionalContextLimit=0，避免宿主把完整控制清单再次转成预览。缺 Hook 或连续性不明时显式 current --reload。

新/变更 Hook 须由 Codex 审查并信任；程序不读写信任数据库。接入与宿主实测分别验收。

SDK `createWorkContextClient(context, {host,sessionId})` 提供 read/bind/current/accept/reset，调用 filesystem 权限保护的 work-context 公共服务；必须显式传原生身份，不推断其他会话。CLI、SDK、Hook 共用同一装配与并发校验服务。业务承接、切换、暂停/结束和退出适用规则由 Runtime 持有，本文仅说明程序契约。
