# 应用包内 CLI 与 Agent 调用

状态：**SDK 1.0.0 开发实现**，2026-10-29，尚未正式发行。统一采用 Manifest schema 1 / SDK 协议 1，全部应用按新契约重建。可运行模板为 `ksf-app create <目录> --template collaboration`；程序与实机证据见项目实施记录。

## 职责与调用路径

应用可以选择把核心业务能力暴露为 CLI。命令实现、参数、业务规则和结果由应用定义；CLI 实现、说明、schema 及运行依赖随同一个应用包交付。KSF 提供通用寻址和调用入口，应用安装后即可通过 KSF CLI 调用，不要求另装全局命令或修改 PATH。

调用路径为：`Agent → KSF CLI → 本机 Web 后端 → 指定应用包的 CLI 入口 → 同版本应用业务处理器`。工作台和 CLI 共用业务后端、数据、授权及并发规则，Core 不逐个内置应用的业务命令。执行仍依托运行中的 Web 后端；读取包内文档不要求启动业务后台。

## 先选择应用，再读取文档

1. 用户明确指定使用哪个应用处理当前任务，可以使用名称或稳定 ID；同名不能确定时先澄清。
2. 从基础索引定位应用。基础索引只提供 ID、名称、简短说明、是否提供 CLI 等信息，不注入所有应用的子命令、手册或业务提示词。
3. Agent 只读取已指定应用的当前 CLI 入口说明，再按需要读取子文档、schema 和样例。
4. 按任务授权调用相应命令，并核对实际结果。

同一任务中有效的应用选择持续生效，后续调用无需反复指定；切换应用或进入无关新任务时不自动继承。没有有效选择时，不因关键词、项目位置、商店推荐或远端消息批量读取应用手册或自行选用应用。仅在任务确需应用时再请用户明确。

这是 Agent 的采用约定。应用按已有后台/消息授权运行，沿用[通信与工作流](communication.md)的规则；远端消息不能代替本机用户新增应用选择。Core 公共通信 CLI 可以直接使用，不要求先选择业务应用。

## 包声明与交付内容

以下为 Manifest 扩展片段，完整应用仍须声明 ID、版本、窗口/卡片、后端及权限：

```json
{
  "schemaVersion":1,
  "sdkVersion": 1,
  "minCoreVersion": "0.3.0",
  "dataStores": [],
  "cli": {
    "contractVersion": 1,
    "entry": "cli/index.mjs",
    "documentation": "docs/cli.md",
    "commands": [
      {"id": "task.create"},
      {"id": "task.get"}
    ]
  }
}
```

| 内容 | 交付要求 |
| --- | --- |
| `cli.entry` | 包内 CLI 实现，首版为 Node ESM；由应用开发者提供 |
| `cli.documentation` | 供 Agent 按需读取的包内入口说明 |
| `cli.commands` | 可调用命令的明确声明；宿主不开放任意后端方法 |
| schema、子文档、模块与依赖 | 随包提供或构建进产物，引用保持在包内 |

打包和安装需校验路径、文件存在性、完整性、模块及文档引用；缺少入口或引用越界时拒绝包。安装只登记静态声明，不执行 CLI 代码。包目录不可变，配置及结果仍保存到应用数据目录。

CLI 属于完整 SDK v1，可用于没有窗口和卡片的纯后台应用。清单必须符合新结构，旧 SDK 包不支持。当前包限制及可用字段见 [Manifest](manifest.md)。

## 商店标识与标准文档入口

`manifest.cli` 是唯一能力依据，不增加开关或新的清单字段。宿主在商店列表、详情和安装/导入预览显示“支持 CLI”；已安装列表依据当前生效包，候选包及等待切换包不会替代当前版本的能力标识。

带窗口的 CLI 应用由宿主在工作台顶部的应用名称菜单中固定提供“CLI 文档”，紧跟“关于”。开发者不需要注册，也不能用自定义菜单覆盖或移除。已安装应用的商店详情另有标注已安装版本的文档入口，纯后台、仅卡片和停用应用同样可用。未安装应用只显示能力标识，不为阅读下载包。

宿主在打开入口的应用窗口内显示文档弹层；从商店进入则归属商店窗口。阅读不启动后台、不加载 CLI 执行模块、不执行命令、不启用应用。其他窗口继续可用，弹层沿用窗口内焦点、Escape 和关闭规则。文档显示应用名称、版本及路径，支持 Markdown、纯文本和 JSON/schema；HTML 不执行，图片与外部资源不自动加载，链接仅能导航到同包允许的文档范围。失败可重试，版本变化须显式刷新。

主文档必须存在、非空、UTF-8 有效且不超过 256 KiB；SDK 打包和宿主安装共用校验。子文档位于 `docs/` 的 `.md`、`.txt`、`.json`，schema 位于 `cli/schemas/` 的 `.json`；每次读取同样核对包完整性、路径、UTF-8 和单文件大小。现有合规应用升级宿主后自动获得入口，无需重打包或迁移数据。

只读 HTTP 接口：`GET /api/apps/cli/docs?appId=<id>&digest=<完整包摘要>&path=<可选包内路径>`。`path` 缺省为主文档；返回 `appId`、`name`、`version`、`packageDigest`、`path`、`text`、`commands`。应用停用不阻止阅读，CLI 执行仍要求启用。摘要不匹配返回 `APP_RELEASE_CHANGED`，路径/编码错误返回 `APP_CLI_DOCUMENT_INVALID`，超限返回 `APP_CLI_DOCUMENT_TOO_LARGE`，完整性错误返回 `APP_PACKAGE_INTEGRITY`；不回退读取其他版本。

## 包内模块契约

入口导出 `createCLI(context)`，返回 `execute(commandId, input, caller)`。宿主先核对命令声明，CLI 适配器负责命令参数及业务映射，共享业务层最终核对业务权限和状态。

`context.invoke(method, params)` 是绑定同版本已激活业务处理器的调用能力。它保留宿主构造的可信来源，不另启业务进程，不允许参数覆盖来源身份。`caller` 由宿主提供；公开类型见 SDK 的 `ApplicationCLIContext`、`ApplicationCLI` 和 `ApplicationCaller`。

下面仅演示转交结构，业务处理器仍须校验输入、授权、操作 ID 和状态版本：

```js
export function createCLI(context) {
  return {
    async execute(commandId, input, caller) {
      if (commandId === 'task.create') return context.invoke('tasks.create', input);
      if (commandId === 'task.get') return context.invoke('tasks.get', input);
      const error = new Error('未声明的应用命令');
      error.code = 'APP_CLI_COMMAND_UNKNOWN';
      throw error;
    }
  };
}
```

CLI 模块在该应用的受管后台内按需加载，KSF CLI 主进程只做通用路由、结构化输入输出和本机转交。初始化应有界返回，应用不在模块初始化时启动业务。执行租约、结果未知及长操作处理沿用应用调用约定，不能把 CLI 变成第二套业务状态或后台调度。

已记录身份迁移的安装可通过登记的旧应用 ID 读取文档、执行命令、检查数据或管理后台；结果使用当前身份，包摘要、启用状态和调用权限照常校验。未迁移的安装不自动建立别名，也不按名称寻找替代应用。

## KSF CLI 入口

以下命令依赖运行中的本机 Web 后端：

```sh
ksf app list --json
ksf app docs <appId> --json
ksf app exec <appId> <commandId> --from - --json
```

| 入口 | 责任与结果 |
| --- | --- |
| `list` | 返回基础索引，不读取 CLI 正文或执行应用 |
| `docs` | 用户已指定应用后，返回入口文档、版本、包摘要和按需文档引用；不执行代码 |
| `exec` | 核对安装/启用、命令、调用授权及预期包摘要，取得对应版本租约，再转交包内入口 |

例如 `ksf app exec com.example.team task.create --from - --json` 自动定位该应用包的入口，Agent 无需查安装目录或直接运行包文件。标准输入为：

```json
{
  "expectedPackageDigest": "文档返回的包摘要",
  "operationId": "调用方预先生成的稳定操作标识",
  "params": {"title": "准备客户方案"}
}
```

宿主消费版本条件，交给 `execute` 的 `input` 保留业务参数、操作 ID 和适用的业务版本条件。重复写调用按同一操作核对；不同参数复用相同操作 ID 应由应用报冲突。读取操作是否需要操作 ID 由应用文档说明。

输出使用有界 JSON，成功包含业务结果或长操作编号；失败保留结构化 `code/message`，结果未知时明确标识并引导查询原操作。长文本/附件使用材料引用及受控流式文件入口，不放入 argv、大 JSON 输出或模型上下文。控制输入最多 1 MiB，单份文档最多 256 KiB；普通调用超时返回结果未知并保留实际执行租约。

## 版本、授权与生命周期

CLI 实现、声明、入口文档和子文档必须绑定同一包摘要。解析入口、校验预期摘要和取得执行租约在同一受协调步骤完成，不能校验旧包后改执行最新包。版本已变化时，Agent 在原有选择范围内重新读取该应用文档，再核对参数；不静默调用其他应用或版本。

升级复用现有排空和切换机制，入口、声明、文档一起切换；停用或卸载后新调用明确失败，不查全局 PATH 或旧包兜底。回退包不等于回退业务数据，见[发布与兼容](release.md)。

本机入口绑定调用主体，应用继续核对业务权限及审批条件。用户指定应用不等于授权其全部写操作；文档也不产生新授权。Agent 履行先指定、后读文档、再调用的约定，宿主不能仅凭命令中自报的 appId 就证明用户已指定。

Web 后端不可用、执行时应用未安装/停用、不支持 CLI、命令未知、参数无效、版本冲突和结果未知应分别报告，不自动安装、启用、换应用或重发写操作。验收要求见[CLI 与通信验收](validation.md#cli-与通信验收)。

## CLI 使用说明的最小内容

- 应用能完成的业务及限制，稳定应用 ID、所需宿主/契约版本。
- 每个命令的参数、输入输出、读取或写入性质、权限及副作用。
- 操作 ID、业务版本条件、长操作查询、取消和未知结果核对方式。
- 长文本/附件的材料入口、相关错误、恢复办法及最小样例。
- 子文档和 schema 的包内引用，版本变化及数据兼容限制。

代码实现、程序验证、真实安装和用户验收分别报告。公共 API 以[接口参考](api.md)及 SDK 类型为准。

## 初始兼容契约与迁移

清单必须声明 `minCoreVersion` 与 `dataStores`（无受管数据填[]）；schemaVersion=1、sdkVersion=1、SDK工具包=1.0.0。安装、启动和回退均核验宿主与数据。受管JSON通过prepareData显式迁移，read不执行迁移；离线检查使用 `ksf app data inspect <appId> --json`。副本不自动恢复，格式不兼容拒绝回退。完整接口及恢复规则见[后端数据](backend-data.md)与[生命周期](lifecycle.md)。
