# 后端、生命周期与数据

## 五种生命周期

| 对象 | 启动/保持 | 结束与恢复 |
| --- | --- | --- |
| 窗口 | 用户打开，持有界面租约 | 关闭保护通过后清理并释放；临时UI状态与业务数据分别恢复 |
| 卡片 | 安装启用应用且桌面包含该实例 | 可被版本切换重挂载；配置和布局不随运行进程删除 |
| 短期任务 | context.tasks.run(action)保活 | action结束释放；不是持久任务队列 |
| 显式后台 | background:true及background能力，startBackground | 安装/启用/工作台启动恢复；停用、升级等待任务后dispose；服务退出尽力清理后停止，业务自行恢复 |
| AI任务 | 提交持久确认后由Core执行 | 关闭窗口/订阅不取消；重启核对原attempt，未知不盲重放 |

v2同应用版本的界面共享一个后端，业务状态不能放在“当前窗口”全局变量。v1保持每窗口独立进程。跨工作台服务的后台所有权会检查，不能重复启动同一业务调度。

## 后端契约

导出 activate(context)，返回call(method,params,caller?)，可选dispose和startBackground。v2 context提供appId、version、workspace、dataDirectory、services.call、locks.run和tasks.run。caller包含instanceId、surfaceId、kind及cardId；由宿主构造，参数里的身份不能替代它。

activate和startBackground需在10秒握手内完成；startBackground只恢复状态、注册计时器并迅速返回，不等待永不结束的循环。普通RPC参数最大1 MiB，最多128个在途调用，等待上限20秒。特殊宿主文件/Git兼容适配不扩大第三方普通RPC。

RPC超时仅表示调用方停止等待，后端可能仍在执行。APP_CALL_TIMEOUT含outcomeUnknown；按业务主键查询原操作，禁止自动重试写入。后端真正返回/退出前，执行租约保留，停用/升级不假装工作已完成。

长操作用tasks.run，并在业务数据保存操作编号。tasks.run只保活，不提供断电重放。应用必须定义自己的中断核对规则。后端dispose应停止计时器并关闭本应用资源，宿主关闭宽限1.5秒后可强制结束；重要数据不能等到dispose才首次保存。

## 文件与锁

工作区原件使用workspace公共服务或前端createWorkspaceClient。文件读写保留保护策略、8 MiB文本、20 MiB图片、版本冲突及原位编辑。不要绕过保护路径或把任意本机路径当工作区文件。

修改共享资源时使用context.locks.run(规范绝对资源键,action)；文件与Git共用Core锁。应用数据使用自己的数据目录和明确串行更新。锁不代替业务幂等，不能拿着资源锁等待用户交互或模型返回。

## 持久化与迁移

```js
import {createJSONStore} from '@ksf/sdk/storage';
const store=createJSONStore(context,{name:'state.json',schemaVersion:1,initial:{count:0},validate:d=>Number.isInteger(d.count)});
const current=await store.read();
const saved=await store.update(d=>({count:d.count+1}),{revision:current.revision});
```

read返回schemaVersion/revision/data；update在文件锁内读、校验、原子替换；revision不一致报APP_DATA_CONFLICT。写失败、未知schema或迁移失败保留原件。migrate(data,fromVersion)必须返回新数据，不能自行修改原文件；迁移后的read仍需通过校验，成功update才落盘。

应用业务数据放dataDirectory；包目录视为不可变。临时缓存可再生成，不能和唯一业务原件混在一起。保存profile选择、businessRunId、stepId、幂等键、aiTaskId、已处理revision及发布回执；不保存模型密钥或隐藏推理。

回退包不回退数据。必须声明旧版本能否读取新schema，不能时先用备份或受支持迁移恢复。卸载保留数据不等于可忽略备份；暂不提供自动通用数据降级。

## SDK v3：持久保活、消息激活与 CLI

运行承载仍为 KSF Web 后端。关闭 Web 前端与停止后端分别处理；前端关闭不停止具备后台条件的应用，后端停止后不要求应用独立存活。

SDK v3 在现有显式后台基础上提供持久业务保活、已授权消息到达时激活，并由应用持有完整工作流及反馈等待。持久保活顺序、接管/去重、暂停和恢复以[通信与工作流](communication.md)为契约主件；当前 `tasks.run()` 不因此获得持久恢复能力。

[包内 CLI](cli.md)复用同版本受管后台与业务数据，按需加载 CLI 适配器并调用共享业务处理器；工作台与 Agent 共用操作和权限规则。`createCLI/context.invoke` 属于包内 CLI 适配器上下文，不能与业务后端 context 混用。
