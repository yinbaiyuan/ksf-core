# 公共 SDK 接口参考

ApplicationPublicServices/WorkspaceService/AIService/TaskActivityService描述服务方法的输入与Promise结果；实际桥仍以paramsArray传参。所有公共类型由SDK入口导出，ApplicationSDK2、ApplicationManifest、ApplicationCaller、ApplicationBackendContext2及AIRequest/AITask/AIEvents等是类型主件。泛型T只描述调用方期待，不能替代运行结果校验。

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
| onBeforeClose(guard) | 注册boolean/Promise<boolean>保护；返回注销函数 |
| session.get/set | 界面临时键值；不是业务持久存储 |
| session.getPosition/setPosition | 阅读锚点；按稳定对象键存储 |
| resources.register(fn)/prepare(path) | 注册保存准备回调/请求跨应用保存；注册返回清理函数，错误阻止后续操作 |
| overlays | 宿主弹层所有权协调；优先使用SDK Sheet/菜单，无需直接管理 |
| reportError(error) | 致命界面失败进入宿主重试；可恢复业务错误自行展示 |
| getSession()/request<T>(url,input?,signal?) | 兼容同源/api桥，保留CSP nonce与会话；写入按宿主鉴权，不用于修改AI管理配置 |
| showDiagnostics() | 打开公共诊断，独立于对话应用安装状态 |

公共模块：@ksf/sdk、/react、/workspace、/ai-tasks、/ai-materials、/storage、/configuration、/window-toolbar、/window-context、/components/ui/sheet、/components/ui/context-menu。原有导出保留兼容；不要因为package.exports中存在一个模块就把其中所有实现细节当新契约。

## 文件客户端

createWorkspaceClient(sdk)返回：tree(path?)、read(path)、search(q,path?)、save({path,text,version})、create({path,kind,text?})、move({path,destination,version})、unlock(path)、upload({path,name,base64})、mediaURL(path)、prepare(path)。

read/save返回WorkspaceFile，包含text、version、policy、writable等。move先请求保存准备，成功后通知文件移动；写入成功通知workspace-change。save不递归触发保存准备，调用方在跨应用破坏性操作前显式prepare。upload是图片接口，不能当音频材料入口。版本冲突含data.disk，必须保留用户草稿并提供核对，不直接覆盖磁盘。

## 后端公共服务

activate返回call(method,params,caller?)、dispose?、startBackground?。服务桥参数是数组，不把params对象误当变参列表。

| 服务 | 方法/签名 |
| --- | --- |
| workspace | locate(path,options?)、tree(path)、read(path)、search({q,path})、save(input)、create(input)、move(input)、unlock({path})、upload({path,name,base64}) |
| tasks | activity()：经过原件和隐私策略处理的活动记录，统计聚合由应用负责 |
| ai | describe()、submit(request)、get(id)、readResult(id)、cancel(id)、events(id,afterSeq?)、register(metadata,text) |
| runtime辅助 | context.locks.run(key,action)、context.tasks.run(action)，由宿主桥管理，不自行伪造retain/unlock消息 |

workspace的saveUnlocked/createUnlocked为受协调官方实现兼容入口；普通应用必须使用正常加锁接口。前端公共文件方法通过HTTP保留原容量；后端大文本不要误塞入普通前端RPC。

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

## SDK v3 扩展

- [包内 CLI](cli.md)：`cli.entry/documentation/commands`、`createCLI(context)`、`execute`、绑定业务处理器的 `context.invoke`，以及 `ksf app list/docs/exec`。
- [通信与工作流](communication.md)：公共端点/消息/材料与回执、Agent 收件、持久 `background.retain/release`、`activation.messages` 和 `onMessage`。

以上由 SDK 协议 3 承载。类型主件为 ApplicationBackendContext3、ApplicationManifestV3、MessageService 与 ApplicationCLIContext；公共材料客户端为 @ksf/sdk/communication。现有显式后台和内存任务租约保持原有语义。
