# 统一配置中心

工作台的“系统设置”、`ksf config` 和后续初始化向导共用配置服务。每项配置仍由其所属模块保存和校验；默认一台设备一个实例，不包含云账号、多实例切换或自动跨设备同步。

## 管理范围

| 领域 ID | 内容 | 权威来源与生效 |
| --- | --- | --- |
| identity | 本地技术身份、邮箱、能力命名空间 | 原 identity user-data；不验证远程账号，不改 USER 或已有对象 ID |
| instance | KSF 实例显示名称 | instance user-data；工作台标题与设置名称读取此值 |
| program | 路由记录、显式更新命令参数 | 原 settings user-data；不启用自动检查或升级 |
| collaboration.user / collaboration.bot | USER/BOT 原文 | 实例根 Markdown；下次读取协作设定时使用 |
| desktop | 桌面分组、卡片及配置、默认窗口大小 | desktop user-data；浏览器间共用，窄屏只投影布局 |
| appearance | 材质与动效偏好 | appearance user-data；即时预览并保存到实例 |
| ai.connections / ai.profiles | AI 连接与执行配置 | 原 AI 配置；新任务使用新值，已接受任务快照保持不变 |
| communication | 监听、发现、容量 | 原通信配置中的可编辑字段；保留 peers、grants、endpoints |
| device | 本机设备名称 | 原 device-profile；与实例显示名、通信指纹分别维护 |
| service | 用户登录启动 | 原 service policy 与 OS 适配；服务端口只读展示 |
| capture | 对话正文归档开关 | 原归档配置；启停区间保留，逐聊天隐私优先 |
| sources | 能力源关联 | 只读入口；关联/解除仍使用 source 模块 |
| ability:<完整对象 ID> | 能力独立设置 | 原对象 user-data；普通 JSON，采用时读取 |

USER/BOT 仍是用户可编辑的原文。个人称呼、语言、时区和开放式协作偏好首版留在原文，不自动抽取或双写 JSON。聊天变量、业务内容、运行队列和凭据不属于普通配置。

## CLI

```sh
.agents/ksf config list --json
.agents/ksf config read instance --json
.agents/ksf config check instance --data '{"name":"我的 KSF"}' --json
.agents/ksf config write instance --data '{"name":"我的 KSF"}' --if-match missing --dry-run --json
# 实际创建时去掉 --dry-run；已有配置必须使用 read 返回的 etag。
.agents/ksf config write collaboration.user --from user-text.json --if-match <etag> --json
.agents/ksf config read ability:partner.example.assistant --json
.agents/ksf config reset program --fields routing --if-match <etag> --json
.agents/ksf config apply communication --if-match <etag> --json
.agents/ksf config export --json
```

`--data/--from` 接受 values 对象；USER/BOT 的输入为 `{"text":"完整原文"}`。`--from -` 读取标准输入，相对文件路径以 KSF 根为准。所有实际写入、重置及 apply 都要求读取版本。JSON 更新顶层字段，提供的嵌套值整体替换；reset 清除所选覆盖或整个领域覆盖。USER/BOT 不提供 reset；需要修改原文时明确编辑并保存。

读取、检查、预览不启动后台、不创建默认文件或写锁。AI/通信/设备的实际修改复用后台自动启动，不打开浏览器；本机登录启动由 OS 适配负责。命令结果不明时先 read 对账，不能新造请求反复提交。`apply` 只应用已保存值，不接收新 values，也不会擅自重启主服务。

## HTTP 与生效结果

`GET /api/config` 返回目录与全部有效可用能力（四类对象，沿用用户/关联源/系统的解析规则）；`GET /api/config/<domain>` 返回保存值、默认值、有效值、etag、作用范围与应用状态。`POST /api/config/<domain>` 接受 `operation`（check/write/reset/apply）、`values`、`ifMatch`、`dryRun`，reset 可传 `fields`。读取不初始化缺失配置。

工作台写请求沿用本机 Origin、JSON 与会话令牌保护。CLI 的 `/api/local/config` 使用现有本机控制凭据；应用业务参数仍由应用管理。当前受信应用同源执行，会话校验不构成应用间的安全沙箱。

返回状态区分立即生效、新任务生效、下次读取、需要重启、未知和应用失败。后台不可用时不能将保存值冒充运行中的有效值。保存后应用失败保留新保存值和明确错误，可以用其最新 etag 重试 apply；不静默回滚。配置状态记录失败时返回已保存及警告，应 read 核对。

版本在所属模块的锁内重新核对。冲突返回 `CONFIG_CONFLICT`，HTTP 409；保留草稿，先查看当前实例值再决定修改。现有模块 CLI/API 保留其原契约，并共用底层校验与锁。不同领域分开保存，没有跨领域全量保存事务。

## 浏览器偏好迁移

工作台检测原桌面 v1/v2/v3 与材质 localStorage，展示迁移预览。导入会替换对应实例设置，需要使用预览所依据的实例版本；不自动选择第一个浏览器覆盖实例。可以保留实例设置并跳过本浏览器迁移。原浏览器记录保留，重复导入不会追加重复分组或卡片。

浏览器缓存只用于读取兜底，不能成为另一份权威配置。保存串行防抖，页面可见时每五秒刷新；已有编辑草稿不被轮询替换。超时先读回确认，无法确认时提示未保存并保留草稿。窗口焦点、滚动位置及临时导航仍属于页面会话。

## 正文归档与导出

正文归档、路由记录、轮次追踪分别表达。首次开启归档复用现有 Hooks 接入，宿主仍需信任精确的 Hook 定义；KSF 不修改信任记录。关闭仅约束之后开始的轮次，保留既有归档；重新开启不补采停用期间的新轮次。只读声明仍可表达 exclude/pause/resume，现有聊天隐私状态不会因全局开关重置。

`config export` 返回 `ksf-configuration` 格式、schemaVersion 1、导出条目和省略说明。默认排除设备设置及 AI 本机程序路径；`--include-device` 明确包含它们，`--include-collaboration` 明确包含 USER/BOT。导出始终排除密钥、通信私钥/信任/授权、正文、运行队列及未声明敏感性的能力任意数据。凭据引用不是密钥值。本版导出不是完整备份；缺失本机路径的 AI 连接需要重新配置，通用导入与完整恢复由 T14 处理。

损坏数据、未知格式、符号链接或并发变化保留原件并报错；不会以默认值覆盖现场。Core 更新不重置用户覆盖，不自动迁移真实 USER/BOT。

## 能力与应用设置入口

系统设置的“能力设置”直接列出所有有效可用能力，支持名称/ID 搜索，点击进入独立设置页。列表仅读取定义元数据，不预载全部能力的个人数据；损坏或歧义目录明确报告不完整。详情读取该对象现有 user-data：布尔、文本、数字提供简单表单，复杂结构及新增配置使用高级 JSON 对象编辑器，不要求动态字段先注册。未配置能力也可进入，明确保存才创建文件，按现有 CAS 和顶层字段更新规则保存。

系统设置不展示应用列表。整个工作台顶部菜单栏点击当前活动应用名称，菜单依次为“关于 <名称>”“设置…”“退出 <名称> 应用”；设置项仅在开发者注册入口后显示。设置内容和持久化由应用自己管理，见[窗口开发约定](app-development/windows.md#应用名称菜单与设置入口)。
