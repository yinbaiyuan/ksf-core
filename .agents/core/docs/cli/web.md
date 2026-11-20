# 前台工作台服务

```sh
.agents/ksf web --json
.agents/ksf web --port 1313 --json
.agents/ksf web --port 0 --json
.agents/ksf web hosts --apply --json
```

前台沿本实例服务策略选择端口，未配置时监听127.0.0.1:1313；端口0仅供隔离调试选择空闲端口。前台进程退出后服务停止，普通后台使用service start或ksf open。同一实例的前台和后台入口共用服务互斥。macOS上80等低端口使用后台启动器继承系统监听。

默认打开ksf.localhost，无需配置hosts；80端口地址为`http://ksf.localhost/`，1313端口为`http://ksf.localhost:1313/`。浏览器将.localhost视为本机安全上下文，可使用WebGPU，实际GPU能力仍由浏览器与设备提供。原ksf.ai hosts入口作为兼容别名保留。监听仅本机可访问，Host/Origin及会话写入鉴权继续生效；端口占用时明确失败，不静默换端口。

后台承载应用、通信、AI、会话和任务归档等服务。前端资源故障提供基础恢复页，不停止管理API与应用后台。/api/health报告主服务身份和前端资源状态。

服务管理、自启动及应用运行管理见[后台服务](../runtime/service.md)。Windows 使用 .agents/ksf.ps1。
