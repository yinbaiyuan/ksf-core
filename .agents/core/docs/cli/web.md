# 前台工作台服务

```sh
.agents/ksf web --json
.agents/ksf web --port 1313 --json
.agents/ksf web --port 0 --json
.agents/ksf web hosts --apply --json
```

默认监听 127.0.0.1:1313；端口 0 仅供隔离调试选择空闲端口。前台进程退出后服务停止，普通后台使用 service start 或 ksf open。同一实例的前台和后台入口共用服务互斥。

配置 hosts 后访问 http://ksf.ai:1313/，也可使用直接回环地址。监听仅本机可访问，Host/Origin 及会话写入鉴权继续生效；端口占用时明确失败，不静默换端口。

后台承载应用、通信、AI、会话和任务归档等服务。前端资源故障返回 WEB_FRONTEND_UNAVAILABLE，不停止管理 API 与应用后台。/api/health 报告主服务身份和前端资源状态。

服务管理、自启动及应用运行管理见[后台服务](../runtime/service.md)。Windows 使用 .agents/ksf.ps1。
