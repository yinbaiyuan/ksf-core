# config 命令

统一配置目录、读取、校验、CAS写入、重置、应用和导出。精确参数、领域表、HTTP、生效及冲突规则由[统一配置中心](../configuration-center.md)持有。

## 调用与影响

```sh
.agents/ksf config --help
.agents/ksf config list --json
.agents/ksf config read instance --json
```

读取、检查和dry-run不创建配置或启动后台；实际运行设置修改可确保后台就绪。修改使用read返回的etag；跨领域不承诺整体事务。导出不是完整备份。

## 实现与验证

实现见[参数适配](../../runtime/src/commands/configuration.js)和[配置服务](../../runtime/src/services/configuration.js)，测试见[configuration.test.js](../../runtime/tests/configuration.test.js)。操作教程见[身份与配置](../handbook/identity-configuration.md)。
