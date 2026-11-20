# 无视觉依赖的 SDK 控制器

这些可选控制器从 `@ksf/sdk/controllers` 导入，帮助应用对接平台服务；界面由应用自己的组件库呈现。完整输入与返回值以 SDK 类型为准。应用仍需按实际使用的宿主能力声明 `minCoreVersion` 和权限，构建工具包版本不代表所有新服务在旧宿主都可用。

| 入口 | 职责 | 应用负责 |
| --- | --- | --- |
| SaveController | 保存草稿快照、版本与请求身份，区分明确失败、冲突和结果待核实 | 编辑与校验、冲突选择、结果展示 |
| createConfigurationSaveAdapter / createConfigurationMutationSaveAdapter | 对接配置写入或恢复默认的同一保存流程 | 把写入或恢复默认意图保存在本次草稿中 |
| createApplicationStorageSaveAdapter | 对接受版本保护的应用存储 | 声明数据范围，保留原件与业务格式 |
| RunController | 沿真实执行身份提交、观察、取消与核对，保留未决操作 | 目标、材料、用户意图与结果采用 |
| createAITaskRunAdapter / createDesktopRunAdapter | 投影 AI 任务或 Desktop 会话的实际能力和运行状态 | 按返回能力提供操作，不假定不同后端有相同功能 |
| createSessionSaveAdapter | 保存与读取带版本的恢复检查点 | 检查点内容及业务恢复策略 |
| CloseCoordinator / createSessionCloseGuard | 合并关闭请求，协调保存、放弃和继续编辑 | 提供真实草稿与未决请求状态，接入 SDK 关闭回调 |
| CommandRegistry / OverlayStack | 管理命令与弹层的作用范围及生命周期 | 应用使用宿主已绑定 owner 的 sdk.commands / sdk.overlays，注销注册 |
| FileOperationState | 串行文件操作意图，保留结果不明的原操作身份 | 沿原身份核对，不把回执丢失当作写入失败后盲重试 |
| createFileResourceAdapter / projectFileResource | 沿公开文件客户端投影资源和版本 | 文件选择、展示与业务采用 |

保存中的新编辑不能被旧回执覆盖；结果不明时先沿原身份读回核对。配置预览不等于保存。控制器不提供通用自动合并，也不改变权限或存储归属。

执行受理、连接情况、执行阶段、停止确认和结果保存分别处理。通用 AI 任务与 Desktop 会话的可用交互不同；公开问题按真实接口回答，原生审批和私密交互继续在原生端完成。关闭窗口不自动停止后台任务。

窗口内弹层放在 SDK `overlayHost`，工具栏放在 `toolbarHost`；自有门户继承应用样式范围。命令与弹层通过 SDK 注册后仍属于当前应用窗口，不能用本地另建控制器取得全局权限。`afterOverlayCommit()` 只是等待受控弹层提交更新的辅助函数。

窗口及门户规则见[窗口与交互](windows.md)，版本与回退见[SDK 兼容](sdk-compatibility.md)，真实文件行为见[文件接口](files.md)。普通应用无需加载这些控制器也可以使用 SDK 服务。
