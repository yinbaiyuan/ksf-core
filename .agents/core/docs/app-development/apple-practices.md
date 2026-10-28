# Apple 实践如何映射到 KSF

核对日期：2026-10-27。采用设计原则并按工作台实际实现调整，不声称实现了macOS原生框架或安全边界。

| 官方依据 | KSF采用规则 |
| --- | --- |
| [Windows](https://developer.apple.com/design/human-interface-guidelines/windows) | 宿主统一窗口边框和控制，多窗口状态与尺寸恢复，内容随窗口尺寸适配 |
| [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars) | 高频操作清晰分组，窄窗进入溢出菜单；KSF采用既有40/68px标题栏规则 |
| [Widgets](https://developer.apple.com/design/human-interface-guidelines/widgets) | 卡片聚焦可快速读取的内容与明确动作，用户配置实例，复杂编辑回到主窗口 |
| [Keeping a widget up to date](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date) | 按可见性和业务变化节制刷新，避免每张卡片重复昂贵工作；不照搬Apple的系统刷新预算数字 |
| [Using the file system effectively](https://developer.apple.com/documentation/foundation/using-the-file-system-effectively) | 安装包不可变，业务数据/缓存/临时文件分开，原子写入并明确恢复 |
| [App Extension Lifecycle](https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionOverview.html) | 界面扩展与业务执行各有生命周期，通过显式宿主接口通信，不假设主窗口必须存在 |

KSF的卡片直接运行Web组件，后台是受管Node进程，AI是持久任务服务；这些均不是WidgetKit、XPC或App Sandbox。权限声明、哈希和来源展示不能代替签名、隔离或发布者认证。未来增加不可信应用支持时需另行设计真实边界，不能通过增加permissions名称宣称完成。
