# contribute 命令

从用户实例最新本地提交 HEAD 选择系统差异，与该提交保存的正式 Core 基线比较，冻结审阅后按授权创建独立的 Core 草稿 PR。维护方法见 [system-contribute](../../abilities/competencies/system-contribute/competency.md)，整体协议见[发行说明](../distribution.md)。

| 调用 | 作用 |
| --- | --- |
| `contribute prepare (--paths <系统文件...> \| --all) [--title <标题>] [--body <说明>] [--dry-run]` | 从 HEAD 冻结选定差异、本地来源、基线和摘要 |
| `contribute read <ID>` | 读取计划并核对摘要；兼容旧计划 |
| `contribute submit <ID> --reviewed <摘要> [--dry-run]` | 核对来源与远程原版 Core，创建纯系统分支和草稿 PR；旧计划仅核对已有 PR |

操作支持 json、单独 help。paths 是 KSF 根下的字面路径，不是 glob；只能选择 AGENTS.md、固定启动器和 `.agents/core/` 系统源码。兼容旧 `.agents/bin/ksf` 的已提交迁移差异。生成的 manifest、release 元数据、临时文件、个人目录和 Git 文件不能贡献。all 与 paths 互斥。

## 已提交来源与基线

prepare 需要 Git、已有 HEAD，且 KSF 根必须是 Git 工作树根。使用 Git 对象中的完整文件、权限及 `HEAD:.agents/core/release.json`，不读暂存区或工作目录；未暂存、已暂存未提交、未跟踪内容全部忽略，也不要求工作区干净。不自动 add、commit、初始化仓库或 push 个人仓库。

比较 HEAD 的完整系统状态，包含多次本地提交的累积差异；即使最后一个提交只有个人资料，也能识别之前的系统变化。基线读取兼容正式 schema 2、3 清单及 schema 4 小型发行凭据，要求仓库、版本、准确 Core 提交和文件校验有效；缺失、损坏或开发包基线均拒绝，不从当前运行目录或最新 main 猜测替代。新凭据仅保存发行身份；prepare 联网读取准确 Core 提交的系统树，使用 Git blob 标识判断变化，按需读取并校验原版内容，不保存独立原版快照。旧清单仍可读取，升级事务与恢复保护继续适用。

无差异返回 CONTRIBUTION_EMPTY，data 包含 sourceCommit、core、version、baseline、comparedFiles 和空 changes，不保存计划。普通 KSF 使用、检查及升级仍不要求 Git。

## 冻结与审阅

新版计划 schema_version 为 2，记录 sourceCommit、baseline（schema_version、manifest_sha256）、core、version、changes 和 digest；每项变化保存原始权限 before_mode、前后校验与冻结内容。计划位于 `.agents/runtime-data/contributions/<ID>/plan.json`，公开 diff 位于 review.diff。prepare 默认标题 Improve ksf-core，标题和说明也会公开；CLI 输出公开 diff 与元数据，不输出二进制 base64。prepare 的 dry-run 不保存计划，但仍会联网读取小型凭据所指的原版及核对既有贡献。公开 Core 的基线读取无需账户，原文按准确提交从 raw 地址读取并核对 Git blob，避免逐文件消耗匿名 REST 配额；已有授权可复用；read 只读本地计划。

首次发布前 HEAD 须与 sourceCommit 相同；新增或切换本地提交后重新 prepare 和审阅。仅继续编辑工作目录或暂存区不影响冻结内容。submit 本地预览不认证、不联网，返回 remoteVerified:false，不能证明远程权限、原版内容或合并条件已核实。

## 公开提交与恢复

真实 submit 使用 KSF_GITHUB_TOKEN、GH_TOKEN、GITHUB_TOKEN 或已有 gh 登录，不回显秘密。任何远程写入前，先读取冻结 core.revision 的真实提交、完整树与选定原版 blob，核对内容和权限；不符、请求失败、树截断或状态未知时停止，保留计划。

Git Data API 只从原版 Core 提交建立纯系统贡献，不发送个人历史、提交说明、作者配置或本地 sourceCommit。核对 fork parent，在 contrib-<ID> 分支向声明的 Core 分支创建草稿 PR，不自动变基到最新 main 或合并。草稿的提醒遵循 [Git 协作规则](../git.md#用户贡献)。

同一 ID 重试重新读取远程分支、提交和 PR，不直接采用缓存 URL。已记录远程提交的重试可在本地 HEAD 前进后核对旧计划，不附带新内容。返回 tree、reused、state、merged、draft；已关闭或合并报告真实状态，不创建替代 PR。远程变化、未合并分支丢失、PR 缺失或查询失败时保留现场。

旧 schema 1 计划可 read，但不能发起新发布。有已有发布记录时 submit 仅通过 GET 核对既有 PR 和完整贡献树，不补造 sourceCommit、不创建任何远程对象、不改写旧本地发布记录。旧计划核对按保存的来源仓库执行，不要求当前读取账号与原贡献账号相同；若来源是 fork，仍核对 parent。其 dry-run 返回 reconcileOnly:true、wouldPublish:false；无发布记录或查不到既有 PR 时返回 CONTRIBUTION_LEGACY_PLAN。

JSON 使用 `{ok, command:"contribute", operation, data, errors}`；成功 0、操作失败 1、参数错误 2。新增错误为 CONTRIBUTION_GIT_REQUIRED、CONTRIBUTION_GIT_ROOT_MISMATCH、CONTRIBUTION_HEAD_REQUIRED、CONTRIBUTION_BASELINE_MISSING、CONTRIBUTION_BASELINE_INVALID、CONTRIBUTION_FILE_TYPE、CONTRIBUTION_SOURCE_MISSING、CONTRIBUTION_BASELINE_UNVERIFIED、CONTRIBUTION_BASELINE_MISMATCH、CONTRIBUTION_LEGACY_PLAN。原有空差异、审阅、摘要、过期、fork 和远程状态保护继续适用。

实现为 committed-source.js、contribute.js、github.js。程序测试使用隔离 Git 仓库及模拟 API；不把模拟成功说成真实 PR 已提交。

## 同一节点与重复内容提示

prepare 返回 warnings，按本机贡献记录识别同一 sourceCommit 或相同系统内容（固定 Core 基线、选定路径、前后内容和权限），不以标题、时间或计划 ID 判断。个人资料提交导致 HEAD 前进，但系统贡献内容相同，仍可识别。只在节点相同、选定内容不同时提示已有贡献，不将其判成完全重复。

有既往发布尝试时只读复核原 PR、分支和完整贡献树；已核实时返回 CONTRIBUTION_PREVIOUS_PR、原 ID、URL、state、merged、draft 和 sameContent。无法核实时返回 CONTRIBUTION_PREVIOUS_PR_UNKNOWN，remoteVerified:false，不把缓存状态称为远程事实。提示是预览附加结果，不进入冻结内容摘要。

submit 对不同 ID 的相同内容再次检查：核实已有 PR 后返回 duplicate:true、原 ID 和 requestedId，open、closed、merged 均不重复创建。已有尝试未形成可核实的 PR 时返回 CONTRIBUTION_PREVIOUS_ATTEMPT，要求重试原 ID；远程状态不明或已变化时保留现场。attempted.json 在第一个远程写入前记录意图，覆盖创建 ref 或 PR 的响应丢失。旧计划没有 sourceCommit 时仅按完全相同的系统内容提示，不能补造节点关联。基于本机保留的记录判断，不声称能识别其他设备或手工创建且没有本机记录的 PR。
