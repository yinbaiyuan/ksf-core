# KSF飞轮 CLI

用户明确选择KSF飞轮后使用。先读取应用列表取得 packageDigest，再以 expectedPackageDigest 调用；写操作同时带稳定 operationId。只管理回顾及建议，不修改项目、能力、知识正文或 Codex 原聊天。

命令：overview（今日、报告和运行状态）、profiles（可选 AI 配置）、report（id）、generate（date，YYYY-MM-DD；显式重新核对时加 force:true 和 operationId）、resume（id）、retry（id 和 operationId，仅已确认失败）、configure（enabled/profileId/timeZone/time，可选 executionKind/desktopProject）、confirm（id/revision/archiveTaskIds）、suggestions（可选 status/type/targetKey）、suggestion（id/revision/status/resolution）、chats（state/target/q/limit/offset）、restore（taskId）。

configure 示例：enabled:true，profileId 为 profiles 返回的既有编号，timeZone:"Asia/Shanghai"，time:"06:00"。首次启用当天是自动范围起点，旧日可显式 generate。generate 接收后立即返回持久编号，反复调用相同输入不会创建重复任务；用 overview 和 report 查询结果。

confirm 表示用户已审阅指定版本，archiveTaskIds 只能来自该报告 eligible=true 的候选。来源变化时跳过对应归档并返回 skipped。不要自动调用 confirm 来替用户审阅。suggestion 的 status 为 pending/deferred/ignored/resolved；resolved 仅表示用户标记处理，不代表已验证。

失败和 reconciling 保留原编号。resume 恢复原步骤，不创建新的 AI 幂等键，也不能绕过结果未知状态。业务数据位于应用 user 范围 reviews.sqlite，运行信息位于 runtime 范围 review-runs.sqlite；SQLite schema/user_version=1，未知版本保留原件并拒绝打开。备份应通过 SQLite backup 或停止应用后复制完整数据，不直接覆盖运行数据库。


## Desktop 回顾

profiles 返回任务 profiles、desktop 连接状态、projects 及各路径读取 issues。configure 可显式设置 executionKind:"desktop"、desktopProject:{name:"项目名",scope:"current"}、profileId:""，其他时间字段保持原义；executionKind 缺省为 task，旧配置继续工作。Desktop 保存失败不会切换任务路径，离线可保留选择。

生成时应用使用 codex-conversations 创建独立证据整理/汇总对话。最终文本必须是 ksf-review-result-v1 JSON 信封，含 operationId、inputDigest、result；应用校验原请求、原生轮次、完整回复、结构及证据引用后才生成报告。Desktop 的 accepted 或 idle 不等于业务完成。待输入、批准、截断、未知派发保留原编号，resume 核对原请求，不自动重发或换执行端。report.execution 标明路径，executionReceipts 保存采用结果的 threadId/turnId/messageId/operationId 与摘要；这些不是 token、费用或工具日志。

用户对报告的审阅和归档仍需显式 confirm，不会因 Desktop 返回结果而自动执行。Desktop 原生对话保留在本机 Codex 中，属于真实模型请求；应用不会把它包装成 ai-task-v1 任务。

Desktop 回顾使用 `competency.ksf.work-review` 基本功。profiles 另返回 capability（有效 ref、名称、版本、source、userRevision、definitionDigest）和 capabilityIssue；缺失或不能校验时不可启动新回顾。生成时冻结本次定义，Desktop 按 extract/reduce/synthesis 阶段经固定 CLI 读取方法，并按正常 KSF 入口记录采用。方法变化使用新的报告及提取缓存身份，恢复在途请求仍使用原定义和原操作编号。

report.execution.capability 保存本次能力身份；executionReceipts[].capability 保存实际采用的能力身份、原生 taskId/turnId、参与 runId/abilityTurnNumber/chatVersion 及采用声明摘要。应用核对同轮 Hook、chat use 和 adopted 声明；模型自报已采用、仅加载定义或旧轮次记录都不算核验通过。记录延迟时先等待，超时用原任务 resume 核对；不会伪造能力记录或自动切回任务路径。旧请求/旧报告保持原协议，不补写虚构采用记录。需要配套 Core 的只读能力服务与原生采用状态。
