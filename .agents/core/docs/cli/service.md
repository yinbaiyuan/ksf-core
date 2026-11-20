# service 命令

管理独立主服务、诊断、日志和用户登录自启动。完整操作、排空、身份及存储契约由[后台服务](../runtime/service.md)持有。

## 调用

```sh
.agents/ksf service --help
.agents/ksf service status --json
.agents/ksf service doctor --json
.agents/ksf service autostart status --json
.agents/ksf service port 80 --json
.agents/ksf service restart --json
```

status/logs/doctor不启动服务。start与open确保唯一服务；停止与重启会影响在途业务，先排空，APP_BUSY时保留现场。Windows使用同根PowerShell入口。

`service port` 保存本实例端口（1—65535），保留自启动设置，下次重启生效。推荐入口为 `http://ksf.localhost/`（80端口）；其他端口显式附在该域名后。macOS低端口由用户launchd创建回环监听，KSF继承套接字直接服务，无需反向代理、管理员身份或证书；首次设置需本机Xcode命令行编译工具生成小型启动器。

## 实现与验证

见[命令](../../runtime/src/commands/service.js)、[服务管理](../../runtime/src/services/service-manager.js)、[后台测试](../../runtime/tests/background-service.test.js)。操作顺序见[日常维护](../operations/daily.md)。
