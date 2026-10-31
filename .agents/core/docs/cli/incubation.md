# 首次孵化与固定入口

`ksf context entry --json` 读取实例孵化状态，返回 mode（incubation/runtime）、stateVersion（schemaVersion/revision/etag）、固定 Core 入口的 source/path/version/sha256/content，以及孵化数据。Agent 按 AGENTS 采用完整 content，草稿和回执仍是数据。新会话首次加载、孵化完成、明确跳过、孵化状态冲突时重取；正常业务不重复判断。

入口不扫描能力目录、不依赖网络或后台，不创建默认配置。固定启动器既有运行时准备与已发起事务恢复照常工作。状态缺失表示旧实例，返回正常 runtime；损坏、未知版本、不可读状态或缺少 Core 定义返回非零退出码和 errors，不静默回退。context capabilities 保持原契约。

## 状态与接口

`.agents/user-data/incubation.json` 是注册的系统用户数据命名空间，使用既有 schema_version/namespace/revision/values 信封。新工作区由 Core 通用模板生成 `{status:"pending"}`；完成为 completed，明确跳过为 skipped。升级与回滚只处理 Core，保持实例原件；贡献不包含真实状态。模板源属于 Core，生成到用户实例的状态属于实例。

```sh
.agents/ksf incubate read --json
.agents/ksf incubate write --from - --if-match <etag> --json
.agents/ksf incubate finish --if-match <etag> --dry-run --json
.agents/ksf incubate finish --if-match <同一etag> --json
.agents/ksf incubate skip --if-match <etag> --json
```

Windows 使用当前根 `.agents/ksf.ps1` 的同名命令。所有修改必须携带 read/write 返回的版本；失败后先 read 对账再继续。read 与所有 dry-run 不写孵化数据、不启动后台、不安装 Hooks、不打开页面。旧实例不能由 write/finish 自动重新初始化。

write 的 JSON 为草稿字段对象，支持部分提供：

```json
{"userLabel":"小林","instanceName":"灵台","deviceName":"小林的 Mac","autostart":true}
```

缺少实例名称时保留已有名称或建议“称呼的 KSF”；设备名保留已保存名称或按称呼与平台生成；登录启动保留已有明确开关，否则建议 true。候选不等于已保存，Agent 须将默认行为清楚告知用户并采用其确认。

可选 openWorkbench:false 只抑制这次打开。deferService:true 表示用户明确接受登录启动应用失败后稍后处理，不能用它跳过必要数据保存。captureEnabled 仅用于用户主动指定；未指定时保留已有显式选择，新实例默认启用，不加入新手问卷。

用户称呼保存到 USER 普通 Markdown，保留其他正文、BOM 与换行。多个常用称呼有歧义时返回 INCUBATION_USER_AMBIGUOUS；Agent 可提供基于最新原文的 userText（最多 256 KiB）和 userEtag，同一次 write 时核验版本。自称来自 instance.name，不向 BOT 复制名字，已有明确自定义不被覆盖。

## 提交、冲突与恢复

write 保存草稿及配置基线，尚不应用四项设置。finish 先校验配置候选，再持有孵化操作锁，创建含稳定操作 ID、目标配置基线、逐步骤结果和工作台打开状态的记录。配置通过现有 USER/实例/通信设备/启动/采集所有者提交，运行配置实际修改可能按需启动后台。

每步使用 CAS 并读回。跨多个文件和操作系统设置不宣称整体原子；中断或失败保留 pending 与已应用结果。重试以实际值和回执对账：静态已保存值不重写，运行设置通过所属模块幂等重试，外部冲突不得强制覆盖。重新 write 表示用户核对后修订草稿并以当前配置重新规划，保留已应用的部分结果，不回滚用户资料。

配置均核验后才写 completed。登录启动“已保存但应用失败”保持可区分；用户明确 deferService 后可完成，回执和配置中心保留失败/暂缓项。“运行与后台”可重新保存登录启动；“快速上手”显示未决项。真实登录与 Hooks 信任必须以宿主/系统真实结果为准。

skip 只补缺失实例名“我的 KSF”、落实新实例记录默认值并标记 skipped，保留既有设置，不新增登录启动、不写 USER、不打开工作台。不恢复此前 finish 尚未完成的步骤。

完成后工作台默认打开一次：先持久记录 requested，再调用操作系统。opened 表示打开请求已由操作系统接受；failed/requested 不自动再次打开，避免结果未知时重复弹窗，可从回执 URL 手动进入。关闭页面不停止后台，登录启动也不打开页面。completed/skipped 重复提交只返回现有结果。

完成或跳过后，Agent 必须重取 context entry，采用返回的正常 runtime 后恢复原始任务。

常见错误：INCUBATION_NOT_PENDING（旧实例/已结束）、INCUBATION_INCOMPLETE（缺项）、CONFIG_CONFLICT/USER_DATA_CONFLICT（版本变化）、INCUBATION_CONFIG_CONFLICT（步骤后的外部变更）、INCUBATION_APPLY_FAILED（部分失败）、INCUBATION_INVALID（损坏/未知状态）。发生错误保留原件、草稿与回执，不通过删除状态来修复。
