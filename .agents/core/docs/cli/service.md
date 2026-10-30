# service 命令

管理独立主服务、诊断、日志和用户登录自启动。完整操作、排空、身份及存储契约由[后台服务](../runtime/service.md)持有。

## 调用

```sh
.agents/ksf service --help
.agents/ksf service status --json
.agents/ksf service doctor --json
.agents/ksf service autostart status --json
```

status/logs/doctor不启动服务。start与open确保唯一服务；停止与重启会影响在途业务，先排空，APP_BUSY时保留现场。Windows使用同根PowerShell入口。

## 实现与验证

见[命令](../../runtime/src/commands/service.js)、[服务管理](../../runtime/src/services/service-manager.js)、[后台测试](../../runtime/tests/background-service.test.js)。操作顺序见[日常维护](../operations/daily.md)。
