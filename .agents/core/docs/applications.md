# 工作台应用安装与运行机制

## 范围与信任约定

工作台提供内置应用商店，开发者独立构建应用，用户可从随 Core 提供的默认源或多个 HTTP(S) 自建源安装。外部应用的前端通过动态 `import()` 加载预构建的 ESM，后端在独立 Node.js 子进程运行。安装、启停、升级和回退不重新构建或重启 Core，也不要求刷新已打开的工作台页面。

本版明确面向受信任代码：前端与工作台共享 JavaScript/DOM 环境；后端拥有当前用户的系统权限。安装页必须展示来源、版本和声明能力，并由用户勾选信任。能力声明不是操作系统沙箱，不保证第三方应用只能执行声明的操作。应用包 SHA256 用于验证索引承诺的内容，不能代替对发布者的信任。

首次升级 Core 以引入此宿主功能时，仍需正常重启服务；此后的应用安装与版本切换无需重启。Core SDK 本身变化仍按 Core 升级管理。

## 组件与边界

| 组件 | 责任 |
| --- | --- |
| 应用商店 | 展示目录、搜索、安装前核对、安装状态、版本管理和应用源配置 |
| 应用管理器 | 合并目录、兼容检查、有限下载、包校验、暂存、原子注册与状态恢复 |
| 桌面注册表 | 合并内置与已启用的外部应用；通知 Dock 和窗口入口更新 |
| 前端宿主 | 按应用版本加载 ESM 与 CSS，调用 mount，提供 SDK，关闭时 dispose |
| 后端宿主 | 每个应用窗口一个子进程，加载 activate，处理 RPC、退出和资源清理 |
| 通用网关 | 延用工作台来源校验和会话令牌，转发启动、调用、心跳及释放 |

应用前端不导入 Core 内部组件，不依赖宿主 React 版本；它可以自行打包 React、Vue 或使用普通 DOM。当前公共前端接口是框架无关的 mount/dispose。应用应约束自己的 CSS 选择器和全局副作用；宿主不会把应用自动变成隔离环境。

## 应用清单

每个包包含 `manifest.json`、`frontend/`，以及可选的 `backend/`：

```json
{
  "schemaVersion": 1,
  "id": "example.notes",
  "name": "示例笔记",
  "version": "1.0.0",
  "description": "独立构建的示例应用",
  "author": "Example",
  "icon": "package",
  "sdkVersion": 1,
  "frontend": { "entry": "frontend/index.js", "styles": ["frontend/index.css"] },
  "backend": { "runtime": "node", "entry": "backend/index.mjs" },
  "permissions": ["filesystem"],
  "multiInstance": true,
  "defaultSize": { "width": 1000, "height": 680 },
  "minSize": { "width": 480, "height": 320 }
}
```

`id` 为稳定的全局小写标识，建议反向域名形式，不得与内置应用冲突。版本使用 `major.minor.patch` 稳定版本号；本协议第一版不接收预发布版本。同一个版本不得在已安装实例上替换为不同内容。

纯前端应用省略 `backend`。使用平台相关二进制时通过 `target` 声明 `darwin-arm64` 等平台；依赖 Node 模块 ABI 时另声明 `nodeAbi`。SDK 版本、平台或 ABI 不兼容时拒绝安装。Node-API 原生模块可以不绑定 Node 模块 ABI。

包中包含所有运行依赖。用户安装时不执行 npm、不编译原生模块，也不执行安装脚本。前端 JS 必须是浏览器可直接执行的 ESM；所有裸包名和 JSX/TS 必须在开发者构建时处理。资源相对引用保持在该版本的资源目录内。

## 公共 SDK 与生命周期

类型契约位于 [application-sdk.d.ts](../runtime/web/src/apps/application-sdk.d.ts)。

前端导出：

```js
export async function mount(container, sdk) {
  const output = document.createElement('p');
  const result = await sdk.call('read', { key: 'hello' });
  output.textContent = result.text;
  container.append(output);
  sdk.setTitle('示例笔记', 'hello');
  return { dispose() { output.remove(); } };
}
```

`sdk.call(method, params)` 只调用当前窗口绑定的后端实例，返回 JSON 可序列化结果。`setTitle` 更新窗口对象信息。`onBeforeClose` 注册异步关闭保护，返回值用于撤销注册。动态生成 style 标签时使用 `styleNonce`，保留当前页面 CSP 的约束。前端应在 dispose 中解除事件、定时器、观察器、框架根和其他资源；异步加载完成时窗口已关闭的，宿主会立即清理。

后端导出：

```js
export async function activate(context) {
  // context: sdkVersion, appId, version, dataDirectory, workspace
  return {
    async call(method, params) {
      if (method !== 'read') throw new Error('未知操作');
      return { text: params.key };
    },
    async dispose() { /* 关闭应用拥有的连接与进程 */ }
  };
}
```

后端只在启动时加载；应用代码不进入 Core 主进程。宿主等待 ready 握手（10 秒超时），RPC 有超时和并发限制；应用崩溃只使该实例失败，重新打开可启动新实例。关闭时先调用 dispose，超过 1.5 秒强制结束后端。父进程断开时，后端宿主主动清理。

浏览器每 20 秒续租；90 秒没有请求或心跳的实例由管理器回收，防止断网、关闭标签页后遗留 Shell。后台页面可能被浏览器长时间冻结，因此不承诺无限期保留断线会话；持久后台服务不是本版窗口实例的生命周期。

## 应用包与发布

`.ksfapp` 是 gzip 压缩的 `ksf-app-package-v1` JSON，携带完整 manifest 和各文件的 Base64、SHA256、执行位。读取器限制下载 32 MiB、解压输出 96 MiB、最多 2000 个文件；拒绝路径穿越、重复或大小写冲突路径、符号链接和缺少入口的包。

开发者先构建到一个独立目录：

```text
build/
  manifest.json
  frontend/index.js
  frontend/index.css
  backend/index.mjs
  backend/node_modules/...
```

然后调用打包工具：

```sh
node .agents/core/runtime/src/applications/pack.mjs /absolute/path/build /absolute/path/store/notes-1.0.0.ksfapp
```

工具输出 manifest 和包的地址、SHA256、字节数，写入源索引中的一个条目：

```json
{
  "protocol": "ksf-app-registry-v1",
  "name": "示例团队应用源",
  "apps": [
    {
      "manifest": { "这里": "放入打包工具输出的完整 manifest" },
      "package": {
        "url": "notes-1.0.0.ksfapp",
        "sha256": "这里替换为输出的64位SHA256",
        "size": 12345
      }
    }
  ]
}
```

把索引和包放到同一个 HTTP(S) 静态站点，用户在商店“应用源”中添加完整 `index.json` 地址。包地址相对于索引解析，也可以是完整 HTTP(S) URL。不需要源站支持浏览器 CORS，因为下载由本机应用管理器完成。首版不处理带登录凭据的私有源；URL 不得嵌入用户名或密码，重定向不跟随。

源身份独立保存；同名应用来自多个源时分别展示，安装前显示确切来源。每个源失败单独反馈，其他源仍可用。停用或移除源不会卸载应用。相同版本含多个平台包时，商店优先展示当前平台兼容项。

随包默认源位于 `applications/store/`，通过工作台的 `/app-store/index.json` 及包 URL 也可读取。因此该目录可直接作为自建静态源的发布内容；默认源本身不需要互联网。

## 安装、升级与回退

1. 用户核对来源、版本、平台和能力声明，勾选信任。
2. 管理器重新读取对应源，核对用户选择的精确包摘要，拒绝目录变化。
3. 有限下载并校验大小、包 SHA256、每个文件和 manifest 一致性。
4. 解包到唯一暂存目录，保存文件摘要和模式；不执行应用代码。
5. 将完整目录移入不可变的摘要目录，原子更新 state.json；进程锁和串行队列避免与并发启动或配置变更交错。
6. 桌面通过刷新通知及目录订阅发现新应用，打开时按已登记的 release 加载前端并启动后端。

下载、校验或注册失败不会替换原有 active 版本。中断留下的未引用包和暂存目录不是已安装应用，不自动执行。锁记录拥有者 PID，只有能证明原进程已退出时才恢复；归属不明的锁保留并报错。

当前窗口固定自己的 release，不随目录刷新替换组件。运行中升级先保存 pending；最后一个旧实例关闭后切换 active，把旧 active 留作 previous。Core 意外停止后，已死亡宿主不再阻止切换。运行实例的拥有者记录也用于避免另一个工作台服务误切换版本；从另一服务运行的应用须先在那里关闭。

回退需要关闭全部实例，并验证旧包完整性；只切换代码，不反向迁移应用数据。应用开发者负责数据兼容，本版不自动执行数据迁移。停用保留包和数据；卸载移除注册、停止实例并保留应用数据。已下载的不可变包作为重新安装和回退缓存保留，本版不自动清理这些缓存。

## 保存与访问边界

```text
.agents/user-data/applications/
  state.json                     应用源、active/pending/previous、启用状态
  packages/<appId>/<sha256>/      不可变应用文件及 release.json
  data/<appId>/                  应用持久数据
  staging/<uuid>/                未完成安装的暂存区
.agents/runtime-data/applications/instances/
  <instanceId>.json               本机进程拥有者记录，可重建的运行数据
```

这些目录位于 Core 之外，Core 更新保留配置、应用和数据。不能将这些内容作为 Core 源码发布。静态网关只暴露已登记应用的前端白名单文件，不暴露 backend、data 或 KSF 根目录。

`/api/apps/` 复用工作台 Origin/Host 校验及写入令牌；启动 Shell、调用后端和安装配置都要求 POST。前端每次请求由宿主 SDK 传入会话认证。应用资源 URL 包含内容摘要，前后端不会因同一可变 URL 指向不同版本而混用。

前端模块在浏览器 ESM 缓存中保留，关闭窗口会释放应用实例和资源，但无法保证引擎卸载模块字节；长时间运行中多次更新的内存增长需要持续测量。初版不实现模块联邦、共享第三方依赖或自动加载未经注册的远程 JS。

## Terminal 验证应用

源码位于 [applications/terminal](../applications/terminal/)。前端将 xterm.js 与 FitAddon 独立打包；后端用 node-pty 创建真正的 PTY，连接用户 Shell。前端没有终端后门：必须先通过商店安装，才能加载资源和启动后端。

构建命令为该应用目录下的 `npm ci`、`npm run build`。构建读取固定依赖，输出各平台 `.ksfapp` 与默认源索引，包含上游许可证，不在用户安装时拉取依赖。

Terminal 支持持续会话、多窗口、中文、ANSI、Ctrl-C、交互程序、窗口缩放和清屏。关闭窗口会结束该窗口的后端和 Shell。输出使用带游标的长轮询，保留有限输出并在发生截断时提示；输入串行发送，避免粘贴和连续输入乱序。

上游预构建可生成 macOS ARM64/x64、Windows ARM64/x64 包。生成包不等于相应平台实机验收，实际执行范围以任务检查点和验证记录为准。

## 验证与后续演进

专项测试覆盖恶意路径、内容篡改、来源变化、不兼容包、独立 HTTP 源、安装持久化、版本配对、延迟升级、回退、数据保留、进程崩溃、HTTP 鉴权及主服务 startedAt 不变。Terminal 另以真实 PTY 验证中文、resize、Ctrl-C 和多会话。界面另通过浏览器完成商店、来源配置及安装后即时运行。

后续若接入不可信开发者，需要增加真实安全边界，而非仅扩充 permissions 数组。发布签名、源认证、用户评价、收费、云端托管、数据迁移及长驻后台服务均需要各自的协议和验证，不由本版自动承诺。
