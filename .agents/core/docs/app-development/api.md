# 公共 SDK 接口参考

ApplicationPublicServices/WorkspaceService/AIService/TaskActivityService描述服务方法的输入与Promise结果；实际桥仍以paramsArray传参。所有公共类型由SDK入口导出，ApplicationSDK、ApplicationManifest、ApplicationCaller、ApplicationBackendContext及AIRequest/AITask/AIEvents等是类型主件。泛型T只描述调用方期待，不能替代运行结果校验。

## 前端

| 接口 | 输入→输出；副作用/清理 |
| --- | --- |
| mount(container,sdk) | 每界面调用，返回可选dispose或Promise；只操作所属容器 |
| mountReact(Component,container,sdk) | 创建独立React根，返回dispose；连接公共上下文及错误边界 |
| useApplicationSDK() | React实例内取得当前sdk，不可在模块初始化时调用 |
| sdk.call<T>(method,params?) | 当前租约→本应用版本后端；参数JSON且≤1MiB，Promise<T>；错误不自动重试 |
| getSnapshot()/subscribe(fn) | SurfaceSnapshot；subscribe返回unsubscribe，使用者负责清理 |
| configuration.get()/set(value) | 当前卡片JSON配置；set失败抛结构化错误，原值保留 |
| navigate(changes,replace?) | 修改当前窗口导航，null删除字段；卡片无当前窗口导航 |
| openApp(id,query?,fresh?) | 请求打开应用，遵守单窗口约束；无主窗口应用不能被当窗口打开 |
| setTitle(title,detail?) | 更新窗口对象信息；卡片不改变桌面标题 |
| onSettings(handler) | 可选窗口设置入口；返回注销函数，菜单跟随工作台顶部活动应用；卡片不提供入口 |
| menu.register(items) | 注册顶部菜单及点击回调，返回 update(items)/dispose()；支持级联、分组、禁用、勾选与 placement，按窗口隔离 |
| useApplicationSettings(handler) | React 窗口注册可选设置入口，null 移除；卸载自动清理 |
| useApplicationMenu(items) | React 动态菜单及回调；卸载自动注销，详见[应用菜单](windows.md#自定义应用菜单) |
| onBeforeClose(guard) | 注册boolean/Promise<boolean>保护；返回注销函数 |
| session.get/set | 界面临时键值；不是业务持久存储 |
| session.getPosition/setPosition | 阅读锚点；按稳定对象键存储 |
| resources.register(fn)/prepare(path) | 注册保存准备回调/请求跨应用保存；注册返回清理函数，错误阻止后续操作 |
| overlays | 宿主弹层所有权协调；优先使用SDK Sheet/菜单，无需直接管理 |
| reportError(error) | 致命界面失败进入宿主重试；可恢复业务错误自行展示 |
| getSession()/request<T>(url,input?,signal?) | 兼容同源/api桥，保留CSP nonce与会话；写入按宿主鉴权，不用于修改AI管理配置 |
| showDiagnostics() | 打开公共诊断，独立于对话应用安装状态 |

公共模块：@ksf/sdk、/react、/workspace、/ai-tasks、/ai-materials、/storage、/configuration、/window-toolbar、/window-context、/application-menu（菜单公共类型）、/components/ui/sheet、/components/ui/context-menu。公共导出统一为新契约；不要因为package.exports中存在一个模块就把其中所有实现细节当新契约。

## 文件客户端

createWorkspaceClient(sdk)返回：tree(path?)、read(path)、search(q,path?)、save({path,text,version})、create({path,kind,text?})、move({path,destination,version})、unlock(path)、upload({path,name,base64})、mediaURL(path)、prepare(path)。

read/save返回WorkspaceFile，包含text、version、policy、writable等。move先请求保存准备，成功后通知文件移动；写入成功通知workspace-change。save不递归触发保存准备，调用方在跨应用破坏性操作前显式prepare。upload是图片接口，不能当音频材料入口。版本冲突含data.disk，必须保留用户草稿并提供核对，不直接覆盖磁盘。

## 后端公共服务

activate返回call(method,params,caller?)、dispose?、startBackground?。服务桥参数是数组，不把params对象误当变参列表。

| 服务 | 方法/签名 |
| --- | --- |
| workspace | locate(path,options?)、tree(path)、read(path)、search({q,path})、save(input)、create(input)、move(input)、unlock({path})、upload({path,name,base64}) |
| tasks | activity()：经过原件和隐私策略处理的活动记录，统计聚合由应用负责 |
| tasks（Core 0.3.1） | reviewSources(input?)、readReviewTurn(input)：分页的只读证据及精确版本轮次，需要 filesystem 权限 |
| capabilities | read({ref,source?})：只读解析本实例基本功，默认 effective；返回正文、版本、来源、user_revision、definition_digest，需要 filesystem 权限；不执行能力或替 Agent 记录采用 |
| ai | describe()、submit(request)、get(id)、readResult(id)、cancel(id)、events(id,afterSeq?)、register(metadata,text) |
| runtime辅助 | context.locks.run(key,action)、context.tasks.run(action)，由宿主桥管理，不自行伪造retain/unlock消息 |

workspace的saveUnlocked/createUnlocked为受协调官方实现兼容入口；普通应用必须使用正常加锁接口。前端公共文件方法通过HTTP保留原容量；后端大文本不要误塞入普通前端RPC。

### 回顾证据读取（Core 0.3.1）

reviewSources 输入可含 startAt/endAt、taskId、limit（1–100）、offset。按消息时间筛选，返回 records、chats、total、nextOffset、errors、capture；不按文件更新时间推断工作日期。records 含 taskId/turnId/revision/digest、消息 ID／时间／阶段、当时路由和全部历史主归属。chats 含整个聊天的 fingerprint、各轮版本、最新消息及读取缺口。正文不在此列表返回。

readReviewTurn 输入为 taskId、turnId、可选预期 revision、消息 offset/limit。版本变化报 TASK_REVIEW_CONFLICT；当前策略不可读报 TASK_REVIEW_UNAVAILABLE。只返回可见用户／助手文本；超长读取以 truncated 明示，不声称完整。缺失消息时间退回轮次起点并标 timeKnown:false。应用需继续读取 nextOffset，并将截断或时间缺口纳入覆盖判断。

排除和暂停的正文、路由不向应用暴露；单处损坏返回缺口，不改写或自动修复原件。查询不执行同步、路由、归属推断或归档；回顾、审阅、建议、归档状态及业务幂等由应用持有。确认动作前重查来源版本，并在后续查询时重新核对归档快照。

## 错误与恢复

错误至少保留code/message，可能含status/data。不同包的Error类不共享instanceof身份，应优先判断code；SDK兼容客户端会重建本包APIError。AI结果另含outcomeUnknown。

APP_MANIFEST_INVALID/APP_PACKAGE_INVALID/APP_PLATFORM_UNSUPPORTED：先修包；APP_VERSION_REUSED：递增版本；APP_BUSY/APP_OTHER_HOST_RUNNING：核对在途操作/其他服务；APP_PROCESS_EXITED：核对持久业务状态后重开；APP_CALL_TIMEOUT：结果未知，查询原动作；WORKSPACE_CONFLICT：保留草稿核对磁盘；APP_DATA_CONFLICT：重读并合并；APP_CARD_CONFIG_*：修配置且保留原值。

## 身份不能混用

| 字段 | 范围及变化 |
| --- | --- |
| sdk.appId / context.appId | 稳定应用ID；AI任务所有权使用它 |
| sdk.version / context.version | 本次包版本；同ID的旧窗口可暂用旧版本 |
| sdk.instanceId | 当前页面界面向宿主申请的后端租约；重挂载改变 |
| sdk.surfaceId / caller.surfaceId | 宿主窗口/桌面分组内的稳定界面身份 |
| sdk.getSession().instanceId | 工作区根身份；不是应用租约 |
| aiTaskId / attemptId | 持久AI任务与一次实际执行；不作为应用界面ID |

工作区、应用和AI任务均由宿主绑定真实身份。不要把getSession().instanceId放进材料上传的租约参数；createAIMaterialClient已经使用正确的sdk.instanceId。

## 接口错误的共同语义

前端call、request及文件方法失败均reject，错误code/message应保留。事件订阅、close guard、resources.register返回清理函数。session/setTitle/navigate/openApp属于UI副作用；它们不返回“已持久完成业务”的承诺。configuration.set同步校验并保存到当前桌面配置，不用于业务事务。describe/get/events/readResult是读取；submit/cancel/register/upload会改变持久AI记录。AI事件游标与业务采用状态需要由应用持久化。

文件服务的错误包括WORKSPACE_READONLY、WORKSPACE_CONFLICT、WORKSPACE_PATH_INVALID、WORKSPACE_TOO_LARGE等，按实际code处理；不得按中文message匹配。移动成功会改变路径和通知观察者；unlock仅在当前服务进程中解锁受支持系统源码，不是永久权限修改。

可运行工程见开发包apps/，接口组合的最小实现见[完整示例](recipes.md)。

## SDK v1 扩展

- [包内 CLI](cli.md)：`cli.entry/documentation/commands`、`createCLI(context)`、`execute`、绑定业务处理器的 `context.invoke`，以及 `ksf app list/docs/exec`。
- [通信与工作流](communication.md)：公共端点/消息/材料与回执、Agent 收件、持久 `background.retain/release`、`activation.messages` 和 `onMessage`。

以上由 SDK 协议 1 承载。类型主件为 ApplicationBackendContext、ApplicationManifest、MessageService 与 ApplicationCLIContext；公共材料客户端为 @ksf/sdk/communication。现有显式后台和内存任务租约保持原有语义。

本轮新契约以[SDK v1 生命周期](lifecycle.md)为准：清单 schemaVersion/sdkVersion 均为 1，后端必须声明 lifecycle；无旧协议兼容。后台管理见[运行服务](../runtime/service.md)。

## 初始兼容契约与迁移

清单必须声明 `minCoreVersion` 与 `dataStores`（无受管数据填[]）；schemaVersion=1、sdkVersion=1、SDK工具包=1.0.0。安装、启动和回退均核验宿主与数据。受管JSON通过prepareData显式迁移，read不执行迁移；离线检查使用 `ksf app data inspect <appId> --json`。副本不自动恢复，格式不兼容拒绝回退。完整接口及恢复规则见[后端数据](backend-data.md)与[生命周期](lifecycle.md)。

## 宿主只读 CLI 文档接口

`GET /api/apps/cli/docs` 接收必填 `appId`、`digest` 和可选 `path`，返回 `appId/name/version/packageDigest/path/text/commands`。读取允许已安装但停用的应用，始终绑定当前安装包，不启动应用或执行 CLI。标准商店标识、固定菜单、文档弹层和错误约束见 [CLI 文档标准](cli.md#商店标识与标准文档入口)。

### 导出应用自己的文件

声明 `data.export`，后端的 `file.export(params)` 返回 `{path,name,sha256}`：path 是应用 user 数据目录内的相对路径，不能包含符号链接；单文件不超过 128 MiB。宿主验证活动租约、归属、文件类型和摘要后，以附件下载返回，拒绝越界和损坏内容。

前端使用 `createApplicationFileClient(sdk)`（`@ksf/sdk/files`）的 `downloadURL(params)`。参数仅用于应用选择自己的产物，不能把任意本机路径作为下载能力。后端不返回私有凭据；下载响应使用 attachment、nosniff 和 no-store。

## 工作流服务

`@ksf/sdk/workflows` 导出工作流描述、字段、运行、绑定和结果事件类型，以及 createWorkflowClient/createCooperationClient。宿主核验调用应用、包摘要和本机等待点，只允许固定方法；不存在任意跨应用方法或地址回调。见[工作流与合作任务回调](workflows.md)。
