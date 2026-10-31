# open 命令

确保当前实例主服务就绪并请求操作系统打开工作台。

```sh
.agents/ksf open --json
```

使用已配置hosts名称或直接回环地址，默认端口1313。多个入口复用当前服务，不停止旧工作或更换实例。会建立本机运行状态并打开浏览器；直接输入URL不能替代启动。Windows使用.agents/ksf.ps1。

错误和进程身份规则由[后台服务](../runtime/service.md)持有；新模板首次完成孵化的自动打开另按[孵化回执](incubation.md)防重复。实现见[服务管理](../../runtime/src/services/service-manager.js)。
