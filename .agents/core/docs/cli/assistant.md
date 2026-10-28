# Assistant 数据接口

`assistant` 向桌面客户端提供与本地工作台同源的归属、聊天和逐轮路由。Core 负责解释项目卡、目标身份与历史；客户端不解析 Markdown，不读取身份密钥，也不另存聊天正文。

```sh
.agents/ksf assistant query --from - --json
.agents/ksf assistant refresh --json
```

query 标准输入是 JSON，`op` 为 `overview`、`chats`、`turns` 或 `route`：

| op | 输入与结果 |
| --- | --- |
| overview | 可传 nativeThreads 原生 Codex 聊天 ID 数组；返回与 task targets 一致的历史归属、聊天摘要、当前项目目录、明确身份映射及项目归属时间线 |
| chats | target、q、limit、offset；按历史主归属筛选后分页，关联对象不建立归属 |
| turns | taskId、target、limit、offset；完整轮次摘要及归属上下文 |
| route | taskId、turnId、target；指定轮次路由及共用的语义变化节点 |

示例输入：`{"op":"chats","target":"current:示例项目","limit":50,"offset":0}`。分页沿用 task 的 1–100 范围。请求最大 4 MiB，身份数组最多 20000 项，每项最长 1024 字符；原生 ID 仅回显调用方提供且能精确匹配的身份，不写入新映射文件。

输出沿用 `{ok,command:"assistant",operation,data,errors}`，data.protocol 为 `ksf-assistant-read-v1`。局部失败保留可读记录并返回 errors／退出 1，参数错误退出 2。query 不写文件，输出移除正文、请求预览、声明回执与正文修订；没有宿主标题时使用通用标题，由客户端以准确匹配的原生标题补充。

归属、默认轮次、待创建身份及绑定语义复用 [task](task.md)。路由变化计算由 `runtime/src/routing/route-evolution.js` 持有，Web 与 Assistant 共用；状态、上报说明与顺序变化不产生新安排节点。历史来源失效保留历史值并附加来源现状，不把 Agent 声明当作宿主实时运行状态。

项目 Token 时间线按每次主归属产生区间，非项目区间使用空 projectCard 明确终止原项目归属。只使用当时已建立的项目，不用后来的绑定反写旧时间。统计规则及本机 Token 读取继续由桌面产品负责。

refresh 是独立的补采动作：只调用已启用的既有采集服务，保留基线、暂停、排除与锁规则，不启用采集或安装 Hooks。关闭采集时返回 skipped，query 仍可查看现有档案。启动器原有恢复和运行时准备边界不变。

macOS 通过固定启动器调用。Windows 桌面宿主可先执行 `.agents/ksf.ps1 launcher recover`，再使用产品自带的 Node 24+ 执行 `runtime/src/assistant-entry.js`；该专用入口仅暴露 query／refresh，存在未完成事务时拒绝读取。这是受支持的宿主桥契约，不表示完整 Windows CLI、升级或发行机制已接入。宿主不得回退全局 Node／Ruby，不得把运行环境能力暴露给渲染层。
