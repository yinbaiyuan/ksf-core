# system 命令

已实现无 Git 工作区的版本检查、更新、自动同步和回滚。完整协议与恢复见[发行说明](../distribution.md)。

| 调用 | 作用 |
| --- | --- |
| `system read` | 模式、版本、来源、系统改动和备份 |
| `system check [--source <地址或索引文件>]` | 检查适用的新 Release |
| `system update [--source <地址或索引文件> \| --from <Core包>] [--dry-run]` | 校验、合并、升级；from 支持离线包 |
| `system sync [--quiet]` | 按间隔检查和升级，记录尝试结果 |
| `system rollback [--dry-run]` | 恢复上次事务保存的系统 |

各操作支持 json、单独 help。quiet 仅限 sync，与 json 互斥。source 与 from 互斥，不持久改变来源；文件按 KSF 根定位。接受 HTTPS、本地文件和 loopback HTTP；拒绝公开明文 HTTP、带凭据地址和降级重定向。

read/check 不写业务目标。update 预览也下载、合并、验证候选，但不切换系统或建立正式备份。update 要求新版本；旧版本使用 rollback。开发仓库 read 返回 development，其余安装操作要求有效 release.json。

## 在用户实例里手动升级

用 Agent 打开自己的 KSF 实例目录，在当前会话里说：

> 请检查 KSF Core 是否有新版本，先预览更新；没有冲突就执行升级，完成后核对版本，并检查我的项目文件是否保留完整。

也可以在实例根目录依次执行：

```sh
./.agents/bin/ksf system read --json
./.agents/bin/ksf system check --json
./.agents/bin/ksf system update --dry-run --json
./.agents/bin/ksf system update --json
./.agents/bin/ksf system read --json
```

`check` 的 `current` 是实例当前版本，`latest` 是公开发行版本，`available: true` 表示有适用的新版本；`available: false` 时无需执行升级。显式 `check` 和 `update` 不受每日自动检查间隔限制，可以立即检查刚发布的版本。

预览成功且 `conflicts` 为空时再执行实际升级；出现冲突时先检查返回的路径和内容，解决后重试。完成后以 `system read` 的 `version` 确认安装版本，并核对需要保留的个人文件。`.ksf-template.json` 记录初始模板出处，升级后仍可能保留初始版本。

系统更新从发行源下载 Core 包，个人实例无需合并 Core 或模板仓库的分支。需要撤销本次升级时，可先运行 `system rollback --dry-run --json` 预览，再运行 `system rollback --json`；升级后新增的 Core 编辑可能阻止回滚，具体以命令结果为准。

## 输出与错误

JSON：`{ok, command:"system", operation, data, errors}`，成功 0、操作失败 1、参数错误 2。update 提供 current/latest、changed、changes、conflicts 和 backup。UPDATE_CONFLICT 时 data 保留冲突内容。自动 quiet 提示写 stderr，不混入业务 stdout。

错误包括 DOWNLOAD_FAILED、RELEASE_NOT_FOUND、CHECKSUM_MISMATCH、RELEASE_INVALID、RELEASE_REPLACED、VERSION_NOT_NEWER、UPDATE_CONFLICT、CANDIDATE_INVALID、SYSTEM_CHANGED、UPDATE_BUSY、BACKUP_MISSING、ROLLBACK_LOCAL_CHANGES。

升级只管理系统文件和本机事务，不写个人目录、Git 配置或忽略规则。固定启动器先恢复中断，再启动 Node；不撤销活跃事务。默认每天自动检查一次，失败也缓存；离线时业务继续。显式操作按实际结果退出。开发包不自动升级。

实现 system.js、network.js 和模板固定启动器；system-update.test.js 覆盖合并、回滚、故障注入和真实 SIGKILL，release-network.test.js 使用真实本机 HTTP。
