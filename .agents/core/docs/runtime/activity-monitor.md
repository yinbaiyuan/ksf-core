# 活动监视器与公共监控接口

「活动监视器」是纯前端随包应用 `com.ksf.activity-monitor`。Core 提供运行投影和控制，关闭监视器后不会继续采样。系统设置的运行管理入口保持兼容。

## 前端接口

```ts
import {createRuntimeMonitorClient} from '@ksf/sdk/runtime-monitor';
const monitor = createRuntimeMonitorClient(sdk);
const snapshot = await monitor.snapshot(signal);
await monitor.act({kind:'task', id:task.id, version:task.version,
  action:'stop', operationId:randomId()});
const {text} = await monitor.logs('app', app.id);
const diagnosis = await monitor.doctor();
```

`randomId` 从 `@ksf/sdk/random-id` 导入，适用于本地 HTTP 域名。清单声明 `runtime.read`／`runtime.manage`。宿主会话的 capabilities 包含 `runtime-monitor-v1` 后才可调用。请求统一经过会话保护的 `POST /api/runtime/monitor`，客户端自动绑定当前应用窗口的 `instanceId`。

快照为 `RuntimeMonitorSnapshot`，包含 service、applications、tasks、counts、resources、issues 和采集时间。状态与操作能力由来源决定。所有活跃工作完整返回，结束记录合计最多 100 条。空、未知、正在读取与失败分别表达；读取不初始化 AI 配置、不启动应用、不创建对话绑定。

`act` 使用 `kind: task | app | service`、对象 ID、快照版本、动作和调用方生成的 operationId。任务只支持来源声明的 stop；应用支持 start／stop／restart；主服务支持 stop／restart。强制操作只适用于应用或主服务，需显式 `force:true`。相同租约、相同操作号和相同参数共用结果；不同参数冲突。回执在主服务内存中保留最近 500 项，主服务重启后应重新核对状态，不能盲目重发。

`MONITOR_STALE` 表示对象已经变化，必须刷新。`APP_BUSY` 表示普通停止未排空在途工作，可展示受影响条目并让用户明确选择强制。传输超时不证明写入失败。AI、对话和终端仍由各自所有者执行停止，不提供任意 PID 杀进程接口。

主服务重启保留原端口。「重新连接」刷新工作台并取得新窗口租约，避免把旧 instanceId 继续发给重启后的服务。

## 应用后台任务

```ts
await context.tasks.run(async signal => {
  await cancellableWork(signal);
}, {name:'整理本期材料', cancellable:true});
```

旧版 `tasks.run(async () => ...)` 保持有效，监视器显示通用名称、真实开始时间和所属应用。声明 cancellable 代表回调实际消费 AbortSignal；请求取消后显示「正在停止」，等回调结束再完成。未声明支持的任务不暴露单独取消按钮。后台任务保活计数、升级排空与进程故障清理沿用原有生命周期。

## 资源与边界

资源通过 macOS ps／Windows PowerShell 系统进程数据异步采集，按 PID 与启动身份匹配；CPU 使用累计 CPU 时间差，逻辑核心口径为 100%。主服务与更具体的应用／AI／终端归属覆盖时不重复计算。同一采样周期合并并发请求，保留十分钟内存曲线；不设置常驻采集计时器，不写资源历史数据库。中断采样后不把长时间平均当作即时 CPU。

Codex 监控只读当前根已有 binding，保持精确原生轮次、持有者和未知投递规则；不会打开 Desktop、自动关联其他线程或更改权限配置。共享 Desktop／远端模型资源不可统计。终端只列当前管理器持有的现有会话。
