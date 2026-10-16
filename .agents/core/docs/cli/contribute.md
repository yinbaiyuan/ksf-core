# contribute 命令

已实现从发行工作区整理选定系统差异并向 Core 创建草稿 PR。准备、读取和预览不要求 Git 或账户。整体流程见[发行说明](../distribution.md)。

| 调用 | 作用 |
| --- | --- |
| `contribute prepare (--paths <系统文件...> \| --all) [--title <标题>] [--body <说明>] [--dry-run]` | 冻结差异、公开 diff 和摘要 |
| `contribute read <ID>` | 读取计划并核对摘要 |
| `contribute submit <ID> --reviewed <摘要> [--dry-run]` | 校验审查内容，创建干净 Core 分支与草稿 PR |

操作支持 json、单独 help。paths 是 KSF 根下的字面路径，不是 glob；只能选择系统文件及 `.agents/core/` 新源码。all 与 paths 互斥。生成的 manifest、release 元数据、临时文件、个人目录和 Git 文件不能贡献。

prepare 默认标题 Improve ksf-core，建议给具体问题标题和说明。这些文字也会公开。计划在 `.agents/runtime-data/contributions/<ID>/plan.json`，公开 diff 在 review.diff；预览不保存计划。CLI 输出 diff、路径、摘要和权限，不输出二进制 base64。

submit 要求准备结果的 digest；审查后文件、权限或安装版本改变时拒绝提交。实际授权来自 KSF_GITHUB_TOKEN、GH_TOKEN、GITHUB_TOKEN 或已登录 gh，不写草稿、不回显。submit 预览不认证、不写远程。

GitHub Git Data API 形成的新提交以发行原版 Core 为父提交，只应用选定差异，不读取个人 Git HEAD、作者配置或提交说明。工具检查 fork 的真实 parent，以 contrib- 开头建立分支，向声明的 Core 分支发起草稿 PR，不自动合并。

同一 ID 可恢复未知响应并复用既有 PR。远程分支变化时拒绝覆盖。JSON 使用 `{ok, command:"contribute", operation, data, errors}`，成功 0、操作失败 1、参数错误 2。典型错误为 CONTRIBUTION_EMPTY、CONTRIBUTION_PATH_INVALID、CONTRIBUTION_REVIEW_REQUIRED、CONTRIBUTION_STALE、CONTRIBUTION_TAMPERED、FORK_INVALID、CONTRIBUTION_BRANCH_CHANGED、GITHUB_AUTH_REQUIRED。

实现 contribute.js、github.js。测试覆盖无 Git 准备、混合私人提交隔离、计划篡改、审查过期、错误 fork 和未知响应恢复；模拟 API 成功不代表远程真实贡献已提交。
