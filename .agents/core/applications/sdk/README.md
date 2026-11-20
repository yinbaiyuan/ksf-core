# KSF 应用 SDK 1.2.0 开发版

SDK API 1.2.0兼容API 1.0.0—1.1.0；构建工具包版本、服务API目标和最低Core分别记录，按声明的兼容范围核验，见[兼容契约](../../docs/app-development/sdk-compatibility.md)。宿主协议仍为 SDK v1；schemaVersion 与 sdkVersion 均为 1，旧包保留原字节和摘要。当前为开发候选，尚未正式发行。应用流程由[KSF 应用管理](../../abilities/partners/app-manager/partner.md)及其基本功持有；接口与工具说明见[应用开发者手册](../../docs/app-development/README.md)和[AI 技术入口](../../docs/app-development/AI-START.md)。

本目录提供公共类型、React适配、文件/AI客户端、JSON持久化、五个模板及ksf-app create/check/build。普通应用的模型执行统一经过宿主AI服务；应用不保存模型密钥或自行启动模型CLI。

应用 ID 必须是 `com.<发布者>.<应用名>` 三段式，如 `com.yinbaiyuan.camp-tasks`；后两段使用小写字母开头的小写字母、数字及段内连字符，总长不超过80。卡片短 ID 独立校验。SDK 1.2构建的新包要求Core 0.5.7；清单/运行协议仍为1，当前SDK工具包和API版本为1.2.0。既有安装的身份迁移须使用配套工具，不能直接改包内manifest或移动单一数据目录，见[发布与迁移](../../docs/app-development/release.md)。

```sh
npm ci --ignore-scripts
node scripts/ksf-app.mjs create ../my-app --template window
```

新应用只依赖手册列出的公共入口，不能依赖Core私有源码。server/protocol.js是应用协议维护源，scripts/sync-protocol.mjs生成独立运行时副本，--check用于CI。运行时不从SDK源码动态读取后端；发布产物包含完整依赖。

本SDK仍面向已确认的受信任代码。能力声明不是沙箱，支持及验收范围见开发手册。

`protocol:check` 与 `scripts/sync-protocol.mjs` 仅供 Core 维护者生成/核对运行时副本；独立开发包不包含该副本，应用开发只需 create/check/build 与模板验收，不执行该维护脚本。

商店图标、截图和更新说明见[展示资料规范](../../docs/app-development/store-listing.md)。应用图标仅支持 PNG（可带透明通道）；截图支持 PNG、JPEG 和 WebP。应用在固定 `store/` 目录定义资料，程序与资料构建为同一个 `.ksfapp`；修改资料须递增版本并重新打包。

新增接口见[应用包内 CLI](../../docs/app-development/cli.md)与[通信、后台和工作流](../../docs/app-development/communication.md)。新建 --template collaboration 可获得包内 CLI 与消息激活的独立工作流示例；任务、等待和审批状态均由应用保存。

生命周期、纯后台与运行管理见[生命周期](../../docs/app-development/lifecycle.md)和[后台服务](../../docs/runtime/service.md)。

应用菜单与设置入口见[窗口与交互](../../docs/app-development/windows.md#应用名称菜单与设置入口)。SDK 支持菜单注册、动态更新、注销与点击回调；菜单展示在整个工作台顶部，跟随活动窗口，设置界面和数据仍归应用管理。

最低 Core 通过必填minCoreVersion声明；dataStores声明受管JSON，空数组表示无受管数据。数据迁移必须在受限prepareData阶段显式进行，read保持只读。完整接口、原件副本与回退限制见[后端数据](../../docs/app-development/backend-data.md)。
## 运行监控补充

`@ksf/sdk/runtime-monitor` 提供 `createRuntimeMonitorClient(sdk)`，通过 `runtime-monitor-v1` 宿主能力与 `runtime.read`／`runtime.manage` 声明读取受管任务、应用、资源、日志并执行受版本保护的控制。后台任务可使用 `context.tasks.run(action, {name, cancellable:true})` 并在回调中消费 `AbortSignal`；旧的无参数回调继续兼容。详见 [监控接口说明](../../docs/runtime/activity-monitor.md)。

声明 manifest.cli 即自动获得商店“支持 CLI”标识及窗口应用名称菜单中“关于”后的固定“CLI 文档”。无需注册开关或自定义菜单，开发者不能覆盖标准项。纯后台、仅卡片及停用应用从商店详情阅读当前安装包。主文档必须非空、有效 UTF-8 且 ≤256 KiB，打包与宿主安装共用校验。阅读不会执行 CLI 或启动后端，具体版本与包内链接限制见 [CLI 文档标准](../../docs/app-development/cli.md#商店标识与标准文档入口)。

## 应用工作流与合作结果

Core 0.3.5 提供 `@ksf/sdk/workflows`：业务应用声明工作流提供能力及 cooperation.request 权限，先保存等待点，再发出合作任务；结果通过宿主绑定的 workflow.signal 送回原运行。流程节点和恢复属于应用。使用 `ksf-app create <目录> --template workflow-provider` 生成可运行示例；详见[工作流契约](../../docs/app-development/workflows.md)与[示例说明](templates/workflow-provider/README.md)。

## 本地安装与独立发布

`ksf-app local <应用目录> --workspace <本机KSF根> --json` 构建并安装本地应用；`--build-only` 只构建。可在应用目录的 ksf-local.json 中保存 `{ "workspace": "相对或绝对路径" }`，project 和 repository 均可选。`dev` 仅为 local 命令别名，不是应用运行模式。

本地包按摘要保存到 `.ksf-local/packages/`，同一版本可反复构建，不改公开版本、正式包或 store/index.json，不提交、推送或发布。本地应用也可直接从商店导入 .ksfapp，无需源码、项目或仓库。关联入口放在本地应用详情，窗口只显示正常应用名。

原本从应用源安装的同 ID 应用，需要显式 `--replace-source` 才能替换安装为本地应用；保留数据和安装身份，更新来源改为本地。之后没有“退出开发”切换。公共发布独立进行，发布不改变本机安装来源。详见[发布说明](../../docs/app-development/release.md#本地应用与源安装应用)。

## 通用文件

`@ksf/sdk/files` 提供三范围的通用字节读写、版本保护、复制移动、内部回收站、变化订阅和公共选择器。接口、限制、恢复及完整示例见[文件操作](../../docs/app-development/files.md)。

## 应用界面与平台服务

应用自主选择组件库、样式和交互，组件与 React 等渲染依赖随应用包交付和升级。无需声明共享 UI、统一主题或共享 React。入口遵守 `mount(container, sdk)` 和 `dispose()`；CSS、快捷键及弹层限定到所属窗口，卸载释放监听和资源。可用原生 DOM 或已有可选 `@ksf/sdk/react` 适配。

未发布的专用组件库与组件实验室已撤回。旧版 `components/ui/*`、`window-toolbar` 等已发布辅助入口继续兼容；新应用不必使用。宿主桌面与设置、项目应用的控件各自由其所属包维护。

### 逐步积累的组件：View

已有且适合的 KSF 组件可默认引用，无需用户每次显性指定；缺少的按实际需求逐个补齐。应用仍可采用其他组件库，不强制统一 renderer 或界面。当前首个正式开发入口为 `@ksf/sdk/view`，组件及样式随应用包交付；SDK 根入口不会自动加载它。完整运行示例见 [KSF 组件库应用](../component-library/README.md)。

```tsx
import { View } from '@ksf/sdk/view';

<View style={{ padding: 24, gap: 16 }}>
  <h1>应用内容</h1>
  <View direction="row" style={{ gap: 16 }}><div>主要内容</div><div>辅助内容</div></View>
</View>
```

`ViewProps` 继承原生 `div` 属性并支持 `ref`。`direction` 为 `column`（默认）或 `row`；间距、尺寸、滚动与响应式布局由应用用 `style`／`className` 控制，View 不预设内边距、圆角、阴影或高度。省略 `theme` 时依次采用最近父 View、SDK 宿主主题；在普通 React 环境中跟随系统。设置 `theme="light"`／`"dark"` 只覆盖本容器及后代，不写宿主设置或本地存储。

View 使用下面的公共主题颜色；旧 `--ksf-view-background`／`surface`／`foreground`／`muted`／`border`／`accent`（同前缀）继续作为别名兼容。根 View 跟随宿主，嵌套 View 继承颜色变量，显式 theme 建立局部主题范围。应用可在范围内用 CSS 覆盖变量；不向全局元素注入样式。在 KSF 中通过 `@ksf/sdk/react` 的 `mountReact` 接入即可获得宿主主题更新，无需额外 Provider。

### 基础按钮：Button

```tsx
import { View } from '@ksf/sdk/view';
import { Button } from '@ksf/sdk/button';

<View direction="row" style={{ gap: 12 }}>
  <Button variant="primary" onClick={save}>保存更改</Button>
  <Button onClick={cancel}>取消</Button>
  <Button variant="subtle" disabled>暂不可用</Button>
</View>
```

`ButtonProps` 继承原生 `button` 属性并转发 `HTMLButtonElement` ref。`variant` 支持 `default`（默认）、`primary`、`subtle`；`type` 默认 `button`，表单提交需显式声明 `type="submit"`，还原用 `type="reset"`。`disabled`、`onClick`、表单属性、`aria-*` 和键盘行为沿用原生元素，应用处理具体业务及异步反馈。按钮只渲染原生 button；导航使用链接，图标按钮需提供可访问名称。

Button自动带入自己的样式，使用公共 `--ksf-color-*`，放在View或bindTheme已接入的主题范围内。不另行订阅宿主或覆盖主题，可继承应用局部颜色。单一基础尺寸（最小高度32px、14px文字、4px圆角），不增加密度、动效、加载或业务状态接口。组件随应用打包；旧 `@ksf/sdk/components/ui/button` 兼容入口保持原实现，不能将旧入口的 `size/asChild/ghost` 等接口视为新Button接口。

组件库应用 `?app=com.ksf.component-library&section=button` 提供真实点击、禁用、ref聚焦、原生表单和浅深示例。

### 公共主题颜色

`@ksf/sdk/theme` 提供 `ColorTheme`、`ThemeMode`、`ThemeColorName`、`ThemeColors` 类型，以及 `themeColors`（原始色值）、`themeVars`（CSS 引用）、`themeColorProperties`（CSS 属性名）和配色用途说明。完整浅深配色见 [公共配色表](THEME-COLORS.md)，组件库应用中的“主题颜色”使用同一来源展示。只有 light／dark 两套颜色；system 是跟随系统的选择方式。

后续 SDK 组件优先消费语义变量，不自行复制色值。背景、正文、边界、主操作与提示色按用途取用；这不引入密度、动效或控件状态矩阵。应用可以直接使用已有配色，也可以选其他组件库；普通应用不自动加载主题。

```tsx
import { View } from '@ksf/sdk/view';
import { themeVars } from '@ksf/sdk/theme';

<View style={{ padding: 24 }}>
  <div style={{ background: themeVars.surface, color: themeVars.foreground }}>
    自己的应用内容与组件
  </div>
</View>
```

普通 CSS 可用 `background: var(--ksf-color-surface)`、`color: var(--ksf-color-foreground)`。组件自身不需要关心宿主使用浅色还是深色。`themeColors.light.primary` 等原始值用于明确主题的绘图或数据导出，普通界面优先使用响应主题变化的 CSS 变量。

不使用 View 或 React 的应用可以独立接入：

```ts
import '@ksf/sdk/theme.css';
import { bindTheme } from '@ksf/sdk/theme';

export function mount(container, sdk) {
  const disposeTheme = bindTheme(container, sdk);
  // 自己的布局；在 CSS 中使用 --ksf-color-*。
  return { dispose() { disposeTheme(); } };
}
```

`bindTheme(element, sdk)` 只订阅宿主快照并设置当前容器的 `data-ksf-theme`，不写宿主设置或存储；返回释放函数，卸载时注销订阅并恢复原属性。`{ theme: 'light' | 'dark' }` 可固定局部主题；同一元素先释放旧绑定再绑定。样式仅提供变量和原生控件的 color-scheme，不修改应用的布局、背景或文字样式。也可给普通元素添加 `.ksf-theme` 跟随系统，或显式 `data-ksf-theme="light" | "dark" | "system"`。嵌套 View 的显式覆盖使用其 `theme` 属性。

配色唯一维护源为 `src/theme.ts`。SDK 维护者运行 `npm run theme:generate` 生成 CSS 与配色表，`npm run theme:check` 和对应测试校验同步；应用开发者无需运行生成器，也没有新增强制构建门禁。

`@ksf/sdk/controllers` 提供无视觉依赖的 SaveController、RunController、会话关闭协商、CommandRegistry、OverlayStack 和资源投影。保存期间保留新草稿；丢失回执沿原操作身份读回核对；取消请求不等于执行已停止；关闭守卫可保存、放弃或继续编辑。窗口、文件、AI、存储及会话服务的权限和数据仍归实际服务。

`builtWithSdkVersion` 标识构建工具包，`sdkApiVersion` 是服务 API 目标，`minCoreVersion` 是最低 Core，`version` 是应用自身版本。SDK/API/Core 与应用版本独立核验，不以组件库版本替代。完整宿主前端的资源身份、安全重载、会话恢复和已核验回退仍保留，应用界面随应用自身更新。

## Agent 组件查询

SDK自带 `ksf-app components search|read|example` 离线只读查询。准备使用KSF组件时，传入目标应用源码目录核对真实SDK来源、公共导出、正式契约、内容摘要和示例类型；已具备不代表任意目标应用都支持。当前174项正式契约和1054个同源示例可查询，其中31项为组合契约，不声明独立业务导出；待实现项不返回伪SDK示例。可按参考来源、组件或组合筛选；Ant与固定免费MIT版Kokonut的来源、实际采用版本及适配差异统一维护在 `components/references.json`。目录、契约与组件库页面同源，应用仍自主选择组件库。

参数、结果字段、目标解析及维护办法见[Agent组件查询](COMPONENTS.md)。`ksf-app components --help --json`可发现操作；未配置PATH时使用当前SDK的`scripts/ksf-app.mjs`执行同一命令。


### 基础呈现与规范

按需导入`@ksf/sdk/typography`的`Text`、`Heading`和`InlineCode`，`@ksf/sdk/icon`的`Icon`，以及`@ksf/sdk/kbd`的`Kbd`。组件消费周围的文字色及公共浅深变量，不订阅第二套主题。Text支持span/p、14/12/11px及默认/辅助文字；Heading输出真实h1—h6，InlineCode输出原生code。Icon接受应用提供的SVG组件，默认装饰隐藏，非空label提供单一图像名称，ref指向span；不强制图标库。Kbd只展示按键，符号可提供aria-label，不注册快捷键。

新入口属于1.2.0未发布开发候选，按元数据内容摘要和目标类型核对，不从相同版本号猜测可用性；本次不改变平台API目标、最低Core或已发布SDK入口。标准示例为`typography.basic`、`icon.basic`、`kbd.basic`，与组件库应用预览同源；先通过`ksf-app components read FND-02|FND-03|FND-04 --app-dir ./my-app --json`核对目标，再按实际示例编号取源码。


### 操作与命令组件

公共按需入口为`@ksf/sdk/icon-button`、`button-group`、`link`、`dropdown-menu`、`context-menu`、`toolbar`、`menubar`。IconButton复用Button与Icon并要求非空label；ButtonGroup只分组，不隐式建立选择模型；Link保留原生a并为_blank补充noopener/noreferrer。

菜单共享MenuItem：命令{id,label,onAction}、分隔{id,type:'separator'}、带items的子菜单；可选disabled/danger/shortcut，叶项可选checked。快捷键文字不注册命令。onAction可返回Promise，失败在组件内反馈。方向键/Home/End/文字定位、子菜单与逐层Escape由底座处理，Tab离开菜单。ContextMenu支持右键、ContextMenu键与Shift+F10。菜单只使用所在窗口overlayHost或自有挂载范围，不挂到document.body，不改变宿主主题；跟随触发区域的语义变量，失活及卸载释放订阅与监听。

Toolbar是应用内部工具栏：items的group分隔，priority高者优先保留，溢出进入更多；左右/Home/End在单一Tab入口内移动。Menubar只处理应用内部常驻菜单，宿主顶栏/OS菜单与全局命令仍沿原SDK服务。旧components/ui/context-menu、WindowToolbar等入口不迁移或删除。新项属于1.2.0未发布开发候选，以正式元数据摘要和目标SDK类型核对为准；平台API版本和最低Core不变。

WindowToolbar默认使用20px单色图标、统一线宽和中性选中底；文字操作及导航保留可见标签，图标操作的中文名称在悬停约300ms或键盘聚焦时显示，相邻图标连续查看时即时切换。提示包括当前状态及已提供的快捷键，支持Escape关闭、移入提示阅读和窄窗避让；更多菜单保留完整中文。SDK与宿主共享样式及提示实现，同时适配已安装应用的旧结构，不新增组件属性或快捷键。
