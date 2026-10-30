# macOS 后台服务

使用当前用户 LaunchAgent，无需安装 root 工作台辅助程序。默认端口 1313。

```sh
.agents/ksf service start --json
.agents/ksf service autostart enable --json
.agents/ksf open --json
.agents/ksf service status --json
.agents/ksf service stop --json
.agents/ksf service autostart disable --json
```

服务标签为 ai.ksf.core，登录定义位于 ~/Library/LaunchAgents/ai.ksf.core.plist。仅用户登录后启动后台，不打开浏览器。

从旧设备部署切换时，先在管理员授权下退役 system/com.ksf.workbench 及其系统级辅助程序，再安装用户级登录定义。该操作属于一次性日常部署，保留旧定义和完整配套快照以便回退；新 Core 不再提供旧安装器。

完整用法与停止、恢复边界见[后台服务](../../docs/runtime/service.md)。
