# 故障处理：先核对现场，再决定恢复动作

按入口、主服务、应用、具体业务的顺序定位。保留错误码、原操作编号、版本和日志，先推进不依赖故障的工作。日志导出前核对凭据和私人正文，不把截图中的旧状态当成实时状态。

## 入口与运行时失败

- 核对当前根及匹配平台，使用原固定入口，不用全局Node绕过校验。
- BOOTSTRAP_MISSING、ARCHIVE_MISSING等指向缺包或不完整系统，恢复匹配版本资产。
- 若已发起系统事务中断，使用launcher recover处理既有事务；未知协议或活跃操作保留，不手删锁或事务目录。
- runtime verify检查随包和已安装Node；成功不证明应用和业务都正常。

## 后台未运行或端口冲突

先service status，再doctor和logs。主动service start或open可启动后台；直接打开URL不能启动。SERVICE_UNRESPONSIVE或身份不符时保留控制文件并核对进程启动身份，不只看PID。

端口1313占用时先查明持有者。不要自动改另一个端口或杀掉陌生进程。SERVICE_DEPLOYING说明配套切换尚未解决，按原回执完成或恢复；不能删部署标记启动半套版本。

## 工作台资源或文档故障

WEB_FRONTEND_UNAVAILABLE表示前端资源不可用，后台和CLI应继续工作。检查匹配资源与构建摘要，不复制另一版本dist来拼接。系统文档缺页或锚点错误时保留路径，重新读取目录并运行文档检查；正文已变而索引过时时重新生成索引。

图片和Mermaid失败应独立展示原始信息，不能让整页空白。先看当前页面错误及浏览器控制台，再核对路径、资源与CSP，不为单页关闭整体保护。

## 配置冲突或数据损坏

CONFIG_CONFLICT及各领域版本冲突：保留草稿，read当前值，比较差异，再用新版本提交最小修改。null不是删除，嵌套值通常整体替换。不能直接修改etag/revision或覆盖原文件来绕过。

未知格式、损坏JSON、符号链接及读取失败保留现场，不以默认配置重置。保存成功但生效失败时保留新保存值及错误，按最新版本重试apply。

## 应用停放、忙碌或版本不兼容

```sh
.agents/ksf app runtime status example.worker --json
.agents/ksf app runtime logs example.worker --json
.agents/ksf app data inspect example.worker --json
```

把example.worker换为实际已安装ID。离线数据inspect不启动应用、不创建缺失文件。先区分未安装、停用、显式停止、准备失败及不兼容。数据迁移由应用prepareData负责，失败可保留已成功文件，不能声称整体回滚。

修复后明确start重试。APP_BUSY时等待调用、文件操作和任务排空；不要以强制退出证明取消成功。同版本不同内容拒绝安装，递增应用版本并核对当前包摘要。

## AI和通信结果未知

AI reconciling：保存原aiTaskId和业务幂等键。查询原结果，API没有上游查询依据时保持未知；取消未确认停止的执行仍可占额度。不能换模型重做或手改任务文件。

通信unconfirmed：查询/reconcile原operationId，保持原消息和材料引用。delivered只证明持久接收；应用acknowledged和业务完成另查。delivery retry只处理本机已收到事件，不提供离线网络补发。

## Desktop接续失败

核对平台、精确客户端兼容范围、原生Desktop持有者及当前根。权限配置和原生审批仍由宿主管理。发送unknown时先核对原操作和历史，不能因工作台页面刷新再发一次。

## 整理可复核报告

报告至少包含：触发条件、当前版本/平台、实际命令及退出码、错误、原回执、受影响边界、已采取动作、产物及恢复点。真实断电、长期运行、Windows原生UI等未覆盖项明确列出，不用其他层测试替代。
