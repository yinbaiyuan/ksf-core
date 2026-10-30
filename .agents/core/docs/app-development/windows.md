# 窗口、交互与 React

## 挂载协议

前端ESM导出 mount(container,sdk)，可返回Promise。返回 `{dispose()}` 负责资源清理。每次挂载只操作自己的容器和通过SDK声明的Portal，不自行创建工作台窗口或修改Dock。

```tsx
import {mountReact,useApplicationSDK} from '@ksf/sdk/react';
function App(){const sdk=useApplicationSDK();return <button onClick={()=>sdk.openApp('markdown')}>打开文档</button>}
export const mount=(container,sdk)=>mountReact(App,container,sdk);
```

React由应用自己打包；SDK适配层提供应用实例上下文、外观、窗口状态、工具栏与弹层协调。useApplicationSDK只能在mountReact内调用。页面公共客户端用于兼容原实现；业务实例调用必须保留自己的sdk，不存成模块级“当前实例”。

## 内容尺寸与滚动

**已实现，必须遵守**：宿主提供有限的应用内容区，并让 `mount(container, sdk)` 的容器占满该区域。窗口、挂载容器与网页视口是不同的尺寸，应用不能用 `100vh`、`100vw` 或内容高度扩大宿主窗口。内容区提供 `overflow:auto` 作为长内容的滚动兜底；弹层槽是其同级节点，不随正文滚走。

简单页面的根元素可用 `height:100%; min-height:0; overflow:auto; box-sizing:border-box`。多栏或带固定工具栏的页面，沿 flex/grid 链设置 `min-height:0; min-width:0`，将 `overflow:auto` 放到实际列表或正文；grid 可伸缩行使用 `minmax(0,1fr)`。保留编辑器、终端和列表自己的滚动，避免给所有后代统一设置 overflow。不要给宿主的 `external-application-*` 类写样式，应用只控制自己的节点。

**验收必须包含**：长列表/长正文能滚动到底；缩小、最大化和恢复窗口后仍可到达末尾；标题栏与 Dock 始终可操作；正文滚动不会移动窗口弹层。需要横向滚动的表格或代码也必须留在窗口内，不能裁掉可操作内容。

## 窗口状态与导航

sdk.getSnapshot()/subscribe()提供活动、可见/可用状态、容器、工具栏槽、导航字符串、外观及卡片尺寸。React使用useSyncExternalStore，原生DOM需要保存unsubscribe并在dispose执行。

sdk.navigate(changes,replace?)更新当前窗口参数；null删除参数。sdk.openApp(id,query?,fresh?)打开另一个应用；fresh=true请求新窗口，仍遵守目标应用单窗口约束。必须保留稳定深链接字段，不能靠页面刷新继续流程。

sdk.session保存实例临时状态和阅读锚点；它不替代后端持久化。重新挂载、关闭窗口和业务恢复分别考虑。sdk.setTitle(title,detail?)设置当前窗口对象信息，不能借此改宿主应用名称。使用SDK的useWindowState与阅读位置接口保留原行为。

## 标题栏与操作

宿主负责窗口控制按钮及标题栏。没有应用操作单元时高度40px；存在按钮、搜索等操作单元时68px。应用通过公共WindowToolbar放入共享槽，不画第二条窗口标题栏，也不手动硬编码主窗口可用高度。

建议控制主要操作数量，按业务频率和重要性排序；窄窗保留关键操作，其他进入溢出菜单。窗口变窄时先收起辅助检查器/侧栏，不突然丢失业务内容。工具栏不能与关闭/最小化/最大化控件重叠。

快捷键只在本窗口活动且未被弹层接管时生效；不要抢占其他窗口、文本编辑器和输入法组合输入。Cmd/Ctrl+S用于保存，Escape关闭当前可关闭弹层，Tab顺序和焦点恢复可用。右键功能必须有可发现的替代入口。

## 关闭、弹层与异常

onBeforeClose注册可异步的关闭保护：true允许，false取消；调用返回值注销。保护中处理保存/放弃/取消，不在dispose里弹确认或执行新的业务写入。

**必须**：窗口内的侧栏、详情、表单、确认和菜单均归属当前窗口；右侧抽屉从本窗口内容区右侧展开，不能从网页右侧展开，也不能使用网页高度作为应用高度。系统设置、桌面卡片库等桌面操作由宿主管理；无窗口卡片的详情使用桌面级展示，不能挤进小卡片。

SDK1.0.0的`Sheet`自动使用窗口弹层槽`getSnapshot().overlayHost`，背景仅将`contentHost`置为inert。标题栏、Dock及其他窗口继续可用；同一窗口的模态弹层互斥，不同窗口互不关闭。最小化/隐藏时随窗口隐藏，移动/缩放时跟随。关闭后恢复原触发位置，Escape只影响活动窗口的当前弹层；Tab在该弹层可操作项间循环。这里的`modal`指应用内容区模态，不声明整个网页`aria-modal=true`。

```tsx
import {useState} from 'react';
import {Sheet} from '@ksf/sdk/components/ui/sheet';
function Inspector(){
  const [open,setOpen]=useState(false);
  return <><button onClick={()=>setOpen(true)}>查看详情</button>
    <Sheet open={open} onOpenChange={setOpen} title="详情">
      <p>在当前窗口内显示的业务内容。</p>
    </Sheet></>;
}
```

输入：`open/onOpenChange/title/children`必需；`side`默认right，`modal`默认true，`presentation`默认drawer，可选dialog在窗口内居中；`showHeader/showClose`默认true。关闭只发送`onOpenChange(false)`，不会自动提交业务操作；保存失败由应用保留输入。输出为当前窗口弹层，无独立运行时；组件卸载释放内容锁与协调器所有权。返回异步保存结果后再由应用决定关闭。隐藏头部时必须提供应用内可发现的关闭入口。

**必须**：原生DOM/第三方Portal使用同一`overlayHost`，仅操作自身节点并在dispose删除；窗口与卡片判断使用`sdk.kind`。缺少可选overlay槽的适配上下文由React层在应用挂载容器内创建边界槽；这不表示支持历史旧SDK协议；不要回退为网页级抽屉。槽容器由宿主管理，不能删除或修改其定位。坐标、百分比、最大尺寸基于该槽，不能用`100vw/100vh`放大应用弹层。宿主全局弹层不是应用开放能力。

**建议**：优先复用Sheet和SDK菜单；避免直接`createPortal(..., document.body)`、Radix全页面modal、document级焦点锁、改body的pointer-events或滚动锁。`ksf-app check`用APP_OVERLAY_SCOPE提示人工复核，属于启发式检查，不是代码沙箱保证。SDK已安装包内含自己的前端副本，升级SDK源码不会改变旧包；修复后必须递增应用版本重打包，再经正常安装/更新流程切换。

挂载失败/后端退出通过宿主显示重试；可恢复业务错误在应用内显示。reportError用于无法继续运行的界面故障。dispose必须可重复安全调用并尽快完成，清理订阅、网络观察、监听和计时器。同一界面的旧清理未完成时，宿主不挂载替代实例；等待10秒仍未结束会显示可重试错误，原清理与租约继续保留，避免重叠执行。异步结果返回前核对实例仍存活，不能把旧窗口结果写入新实例。

SDK通用样式位于ksf-sdk-surface作用域；构建器进一步给所有应用CSS选择器与关键帧绑定appId/version命名空间，SDK Portal继承相同范围。非React Portal必须把应用容器的ksf-app-*命名空间类带到overlayHost中的自有Portal根，不能向body追加业务弹层。应用自己的CSS使用应用前缀；避免html/body、全局button、通配reset及覆盖宿主类。业务样式留在应用，不能进入通用SDK。

## 应用名称菜单与设置入口

宿主在工作台全局顶部菜单栏的活动应用名称处提供菜单，顺序为“关于 <应用名>”“设置…”“退出 <应用名> 应用”。关于使用包的名称、版本、描述与作者；退出关闭当前页面中该应用的所有窗口，逐个遵守 `onBeforeClose`，任一窗口取消即停止后续关闭。后台任务、驻留与持久保活仍遵循独立生命周期；需要停止后台时使用运行与后台管理。

“设置…”是可选项：默认不显示，由开发者在窗口存活期间注册 `sdk.onSettings?.(openSettings)`，返回注销函数。重复挂载或窗口关闭须注销，宿主也会在挂载失败或卸载时清理。卡片不提供此入口。旧包未注册则只显示关于与退出。不同窗口的注册互相独立，可随当前业务对象变化。

```tsx
import {useState} from 'react';
import {useApplicationSettings} from '@ksf/sdk/window-context';
import {Sheet} from '@ksf/sdk/components/ui/sheet';
function App(){
  const [settings,setSettings]=useState(false);
  useApplicationSettings(()=>setSettings(true)); // 传 null 可移除入口
  return <Sheet open={settings} onOpenChange={setSettings} title="应用设置">
    <p>由应用绘制和保存自己的业务参数。</p>
  </Sheet>;
}
```

原生 DOM 使用 `const unregister=sdk.onSettings?.(()=>openSettings())`，并在 `dispose()` 调用 `unregister?.()`。该接口只表达菜单动作，不新增 SDK 通用设置 Schema，也不把应用数据搬到系统配置中心。Git 仓库工作区已注册其现有仓库设置页；未选仓库时无此入口。

### 自定义应用菜单

SDK 的 `sdk.menu?.register(items)` 注册当前窗口的自定义菜单，默认显示为工作台顶部并列的应用菜单（如文件、编辑、显示）；顶层项指定 placement:"application" 时，插在应用名称菜单的“设置…”之后、“退出”之前。返回 `{update(items),dispose()}`；update 整体替换本次注册，dispose 注销。每个窗口同时有一份自定义菜单，后注册取代前注册；旧注册的更新或注销不覆盖新注册。窗口关闭、版本替换、挂载失败均清理注册。卡片不能注册应用菜单。

每项支持：`id`、`label`、`onAction(event)`、`disabled`、`checked`、`separator`（本项前分组线）、`danger`，或 `children` 子菜单。点击事件含 `id`，勾选项还含期望的下一状态 `checked`；业务自己保存并更新菜单。菜单最多 64 项、四层，ID 在窗口内唯一，`ksf.` 前缀保留给宿主。禁用项不能触发；异步动作在途时防止重复点击，失败显示错误。子菜单用悬停/右箭头展开级联子菜单，左箭头返回上级；上下箭头、Home/End、Escape 与焦点恢复可用。菜单内容或状态改变、注销或活动窗口切换时关闭已展开内容；仅回调更新保持展开，避免触发过期动作。

```tsx
import {useApplicationMenu} from '@ksf/sdk/window-context';
function App(){
  const [wrap,setWrap]=useState(false);
  useApplicationMenu([
    {id:'refresh',label:'刷新',onAction:async()=>refreshData()},
    {id:'view',label:'显示',children:[
      {id:'view.wrap',label:'自动换行',checked:wrap,onAction:({checked})=>setWrap(checked!)},
    ]},
  ]);
  return <Content/>;
}
```

非 React 应用使用 `const menu=sdk.menu?.register([{id:'refresh',label:'刷新',onAction:()=>refreshData()}])`，状态变化调用 `menu?.update(nextItems)`，dispose 调用 `menu?.dispose()`。菜单按窗口隔离，回调保留在该前端实例，不通过后台 RPC 传输函数；需要业务写入时回调自己使用 `sdk.call()`，继续遵守原业务并发与错误规则。

菜单栏属于整个工作台，由当前活动窗口提供；窗口标题栏的名称仅作显示，不再放菜单。点击另一应用/同一应用的另一窗口时，立即切换到该窗口注册的设置、菜单和回调；显示桌面、最小化或关闭窗口后不保留已失效窗口的菜单。打开菜单后横向悬停可切换顶层菜单；级联子菜单随悬停展开，支持方向键、Home/End、Escape 与焦点恢复。窄屏容纳不下的顶层菜单进入“更多”。

```tsx
useApplicationMenu([
  {id:'file',label:'文件',children:[
    {id:'file.import',label:'导入…',onAction:()=>openImport()},
    {id:'file.export',label:'导出…',disabled:!canExport,onAction:()=>exportData()},
  ]},
  {id:'help',label:'帮助',children:[{id:'help.guide',label:'KSF手册',onAction:()=>openGuide()}]},
  {id:'preferences-extra',placement:'application',label:'高级配置…',onAction:()=>openAdvanced()},
]);
```

声明 `manifest.cli` 的窗口应用自动获得固定的“CLI 文档”菜单，位于“关于”之后。它由宿主渲染当前包内文档并归属当前窗口，不依赖 `menu.register`，不受自定义菜单更新或清理影响。`ksf.` 前缀保留给宿主，不能覆盖标准项。纯后台、卡片和停用应用从商店详情阅读，见 [CLI 文档标准](cli.md#商店标识与标准文档入口)。
