# 本机运行数据

`.agents/runtime-data/` 保存当前设备上运行 KSF 所需的状态。它默认不提交、不随用户跨设备迁移，也不随 `.agents/core/` 整体替换。目录中的安装可以重建，事务和历史记录却可能仍有恢复价值；清理必须按子项判断。返回[架构总览](README.md)。

## 谁生成、谁使用

下表路径相对于 `.agents/runtime-data/`。按需创建的目录允许不存在；表中名称以当前实现为准，扩展状态需同步更新本表。

| 位置 | 生产者与消费者 | 保留、恢复和清理条件 |
| --- | --- | --- |
| `.gitignore` | 固定入口创建；Git 读取 | 忽略本目录全部内容；正常保留，不把它当网盘排除配置 |
| `runtime/node/<版本>-<平台>-<压缩包摘要>/` | bootstrap 准备和使用，含 Node、LICENSE、安装记录 | 可由匹配的随包压缩包重建；清理旧身份前核对是否仍有进程或回退版本需要它 |
| `runtime/locks/<安装身份>.lock` | bootstrap 使用原生 shlock 协调同身份准备 | 正常结束释放；死亡 owner 由原生机制判断，等待有上限；不在安装进行中手动删除 |
| `runtime/staging/` | bootstrap 的构建输入准备、解压和安装替换 | 正常退出清理；同身份安装遗留物在取得相应锁后处理，不能整目录并发清空 |
| `objects/write.lock` | 对象写服务创建与释放 | 对象写入全局锁；遗留锁需核实持有者，不自动按 PID 抢占 |
| `projects/write.lock` | 项目服务创建与释放 | 协调项目修改；遗留锁需核对进程和未完成操作 |
| `user-data/<命名空间>.lock` | user-data 写服务创建与释放 | 仅本机写锁；不迁入可移植数据目录，遗留锁需核对后处理 |
| `system/check.json` | 显式 system sync 记录并读取 | 保存检查尝试及结果；清除会丢失间隔依据，下一次显式 sync 可能立即检查和更新 |
| `system/check-corrupt-<ID>.json` | sync 发现无效检查 JSON 后保留 | 排查缓存损坏时使用；确认不再需要该证据后可人工归档或清理 |
| `system/prepare-<ID>/` | 系统安装事务生产端 | 事务公布前的元数据准备；异常遗留应核对 owner 和相邻事务，不能当成已提交事务执行 |
| `system/transaction/` | system update/rollback 生产；入口恢复端消费 | 当前已公布事务，可能仍活跃或需要恢复；先走恢复协议，不能直接删除 |
| `system/recovery.lock` | 固定入口的恢复互斥锁 | macOS 使用 shlock；Windows 使用独占文件句柄；不要把两平台的锁回收方式混用 |
| `system/backups/<ID>/` | 完成的升级、回滚或恢复归档 | 保留旧 Core、变化根文件快照和元数据；删除会影响可回滚历史，当前无自动保留期或垃圾回收命令 |
| `system/failed/<ID>/` | 失败或中断事务恢复归档 | 留下故障材料，可能含失败 Core；先确认恢复完成与材料价值，再决定清理 |
| `contributions/<ID>/` | contribute prepare、read、submit | plan.json 固定选定系统差异，review.diff 用于审阅，submitted.json 留存远程状态；删除会丢失本地审阅与续查依据，不会撤销远程 PR |
| `releases/<版本>-<平台>/` | release build 默认输出 | 包含生成模板、压缩包和索引；可从相同输入重新构建，已用于发布或审计的产物应先核实留存要求 |

release build 允许显式指定其他输出目录，不能只扫描默认位置就声称找到了全部构建产物。部分校验、候选安装及合并目录在操作系统临时目录中创建，正常结束清理，也不集中在这里。

## 临时状态不全部位于 runtime-data

metadata 为保证同一文件系统发布，在目标文件旁使用 `.ksf-metadata-*.lock` 和 `.ksf-metadata-*.tmp`。对象和项目的目录暂存、删除暂存也可能靠近用户目标目录；user-data 原子写临时文件位于 `.agents/user-data/`。这些位置由各自存储实现负责，不能仅凭 runtime-data 没有锁就判断没有活动写入。

新增机制时先决定状态是否只属于本机。缓存、安装身份、PID 和写锁通常属于本层；需要跨设备保留的 KSF 用户设置归 [user-data](user-data.md)；项目进展、任务记录和成果归正常用户空间。

## 故障处理顺序

1. 核对实际 KSF 根和报错层次，记录错误、锁和事务状态；不先清空整个 runtime-data。
2. 运行时准备异常时，使用 `runtime verify` 核验匹配的包和安装。该命令可能修复安装，不是纯读取。
3. 系统事务异常时，优先通过固定入口 `launcher recover`。活跃 owner、未知协议、根文件并发编辑或归档冲突都要保留现场。
4. 对对象、项目或 user-data 遗留锁，核实进程及目标当前状态后再人工处理。普通写入服务没有统一的“按 PID 自动回收全部锁”机制。
5. 确认已无活动操作、恢复依赖或审计需要后，按明确子项清理。当前没有统一 runtime-data 清理 CLI。

网盘、目录复制工具需单独排除本目录。Gitignore 只控制 Git，不能阻止其他同步工具把本机事务、锁或备份复制到另一台设备。

## 实现与验证来源

运行时：[bootstrap.sh](../../runtime/bootstrap.sh)、[bootstrap.test.js](../../runtime/tests/bootstrap.test.js)。文件与写锁：[metadata/files.js](../../runtime/src/metadata/files.js)、[objects/storage.js](../../runtime/src/objects/storage.js)、[projects.js](../../runtime/src/services/projects.js)、[user-data/storage.js](../../runtime/src/user-data/storage.js)，相应验证见 [metadata.test.js](../../runtime/tests/metadata.test.js)、[objects.test.js](../../runtime/tests/objects.test.js)和 [projects.test.js](../../runtime/tests/projects.test.js)。

事务与记录：[system.js](../../runtime/src/distribution/system.js)、[contribute.js](../../runtime/src/distribution/contribute.js)、[release.js](../../runtime/src/distribution/release.js)。相关验证：[launcher.test.js](../../runtime/tests/launcher.test.js)、[system-update.test.js](../../runtime/tests/system-update.test.js)、[contribute.test.js](../../runtime/tests/contribute.test.js)、[user-data.test.js](../../runtime/tests/user-data.test.js)。恢复布局的精确约定由[启动入口契约](../../runtime/launcher.md)持有。
