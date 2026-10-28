# 工作台应用安装与运行机制

开发入口统一为[应用开发者手册](app-development/README.md)，AI开发者先读[AI-START](app-development/AI-START.md)。SDK包2.2.1、Manifest/宿主协议v2，保留v1兼容。

应用为唯一安装单元，提供可选主窗口、多种卡片及可选后端。前端预构建ESM/CSS动态加载，后端独立Node进程；v1每窗口独立，v2同版本共享。显式后台、短任务租约与持久AI任务分别管理，详见[后端生命周期](app-development/backend-data.md)。

应用商店合并默认与多个HTTP(S)源，展示来源和能力，核对摘要后原子安装。前后端按不可变release配对，升级保留旧窗口及在途操作，排空后切换卡片/后台。桌面v3兼容旧布局，缺失或卸载应用保留恢复占位。公共诊断独立保留。

包、容量、平台、版本及SDK兼容以[Manifest和包协议](app-development/manifest.md)为准；发版、回退、停用卸载与v1入口见[发布与兼容](app-development/release.md)。应用模型调用统一经过[AI服务](app-development/ai.md)，业务流程仍归应用。

前端共享JavaScript/DOM，后端拥有当前用户权限。权限列表不构成沙箱，SHA256不是发布者认证。首次引入新宿主代码仍需宿主切换；应用安装升级不重启主服务。不可信开发者沙箱、签名市场和跨设备持续执行不属于当前实现。

规划中的[包内 CLI 与 Agent 调用](app-development/cli.md)、[内网通信与应用工作流](app-development/communication.md)已纳入开发手册：CLI 随包交付并由 KSF CLI 统一调用，用户指定应用后才读取对应文档；工作流归应用，公共层补在线投递、持久保活及消息激活。这些新契约尚未实现，不改变当前 SDK/宿主版本。
