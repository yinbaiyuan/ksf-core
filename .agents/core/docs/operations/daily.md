# 日常维护：检查、配置、后台与升级

目标：用已有接口确认当前实例和应用状态，在保留业务数据及未知结果的前提下维护运行。默认一设备一实例。

## 每次维护先确认

```sh
.agents/ksf hello --json
.agents/ksf service status --json
.agents/ksf app runtime list --json
```

核对根目录、随包Node、进程身份、前端资源、应用是否启用、显式停止或数据停放。状态和日志查询不启动后台；hello首次调用可能准备随包运行时，不等于整个启动链零写入。

## 启动和打开

service start建立后台，open还会打开浏览器。多个主动入口共用启动协调和实际宿主锁，不自动换端口或接管无法核实的活进程。服务异常先doctor和logs，保留原始现场。

## 自启动与停止

```sh
.agents/ksf service autostart status --json
.agents/ksf service logs --json
.agents/ksf service doctor --json
```

明确启用或关闭自启动分别使用autostart enable/disable；Mac采用当前用户LaunchAgent，Windows采用当前用户交互登录计划任务。关闭自启动不停止当前工作，下次实际注销/登录/重启须另验。

service stop/restart和app runtime stop/restart会拒绝新工作并等待在途调用、任务及通信排空。APP_BUSY时先处理原任务和回执。不要为加载文档而强制终止终端或真实业务；版本可保持待生效。

## 配置维护

用config list/read查领域和版本，check或dry-run预览，实际write后读回。后台配置修改可启动主服务；静态读取不启动。保存与运行中生效分开，出现应用失败用最新版本核对后apply。见[配置中心](../configuration-center.md)。

## 升级前后

1. 核对当前源码/构建版本、安装基线和实际服务，记录未提交修改与恢复材料。
2. 备份用户正文、独立工程和必要身份，核对应用宿主及数据格式兼容。
3. 显式system check与update --dry-run，阅读文件差异、冲突及兼容诊断。
4. 用户已明确要求升级后，执行实际更新；未知结果恢复原事务，不新建一轮掩盖现场。
5. 验证运行时、应用、原始数据、身份和关键业务入口。程序回滚不自动恢复业务数据。

Core开发标记的实例不能当成已公开发行，正式发行源和本机变更分别确认。详见[system CLI](../cli/system.md)、[发行协议](../distribution.md)与[数据兼容](../runtime/data-compatibility.md)。

## 验收与交付

记录本次实际改动、数据保留、测试环境、已安装与待生效状态、未验证平台及回退位置。结构检查、模拟测试、原生平台、真实用户验收各有自己的证据。
