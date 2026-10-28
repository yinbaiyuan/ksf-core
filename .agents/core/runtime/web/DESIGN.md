---
version: alpha
name: KSF 工作台
description: 雪山桌面、实色应用窗口、悬浮 Dock 与清晰文稿的 PC Web OS
colors:
  primary: "#0066D6"
  focus: "#004C9E"
  action-start: "#0872D4"
  action-end: "#0965CB"
  action-hover-end: "#086AD4"
  selection-ink: "#003C78"
  round-badge-end: "#096AD7"
  white: "#FFFFFF"
  paper: "#FDFEFF"
  foreground: "#202632"
  muted: "#58657A"
  directory-text: "#17283E"
  directory-muted: "#243147"
  navigation-link: "#003568"
  border: "#E3E8F1"
  ground: "#B8C7D8"
  glass-panel: "#FFFFFFA3"
  glass-workspace: "#FFFFFFA3"
  glass-chat: "#FFFFFFB8"
  glass-round: "#FFFFFFB8"
  glass-toolbar: "#FFFFFF9E"
  glass-lens: "#FFFFFF99"
  fallback-surface: "#EDF2FA"
  search-surface: "#FFFFFF40"
  search-focus-surface: "#FFFFFF99"
  relation-surface: "#EDF5FF"
  relation-text: "#0066C7"
  process-surface: "#F1F5FB"
  code-surface: "#F0F4FA"
  search-match: "#FFE997"
  search-match-text: "#463719"
  text-selection: "#C9E1FF"
  text-selection-ink: "#123969"
  warning: "#855B16"
  error: "#A33838"
typography:
  context-title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: -0.025em
  section:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 19px
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.85
  navigation:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.55
  caption:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.6
  route-value:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 14px
    fontWeight: 550
    lineHeight: 1.6
  body-subheading:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.5
  button:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.3
  round-number:
    fontFamily: ui-monospace, SFMono-Regular, Consolas, monospace
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.7
rounded:
  shell: 22px
  sheet: 20px
  document: 17px
  selection: 11px
  field: 10px
  control: 9px
  section-tab: 999px
  round-badge: 6px
  label: 5px
  match: 3px
spacing:
  micro: 3px
  xs: 4px
  sm: 8px
  shell: 18px
  md: 16px
  lg: 24px
  reading-inset: 28px
  section-gap: 26px
  directory: 264px
  rounds: 264px
  reader-measure: 860px
components:
  directory:
    textColor: "{colors.directory-text}"
    rounded: "{rounded.shell}"
    width: "{spacing.directory}"
  selected-chat:
    textColor: "{colors.selection-ink}"
    rounded: "{rounded.selection}"
    padding: 9px
  round-sidebar:
    width: "{spacing.rounds}"
  selected-round:
    rounded: "{rounded.selection}"
    padding: 11px 10px
  reader:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.document}"
  button-primary:
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: 7px 10px
  button-ghost:
    textColor: "{colors.muted}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: 7px 10px
  button-outline:
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: 7px 10px
  search-field:
    backgroundColor: "{colors.search-surface}"
    textColor: "{colors.directory-text}"
    typography: "{typography.caption}"
    rounded: "{rounded.field}"
    height: 35px
  search-field-focus:
    backgroundColor: "{colors.search-focus-surface}"
  section-tab:
    typography: "{typography.navigation}"
    rounded: "{rounded.section-tab}"
    padding: 5px 11px
  section-tab-current:
    backgroundColor: "{colors.white}"
  relation-primary:
    backgroundColor: "{colors.relation-surface}"
    textColor: "{colors.relation-text}"
    typography: "{typography.caption}"
    rounded: "{rounded.label}"
  process-records:
    backgroundColor: "{colors.process-surface}"
    rounded: "{rounded.selection}"
    padding: 17px
  reader-tool:
    width: 32px
    height: 32px
  route-evolution:
    textColor: "{colors.foreground}"
    typography: "{typography.route-value}"
---

# Design System: KSF 工作台

## 当前 Web OS 外壳

系统操作集中在紧贴左上角Logo下沿、向右下展开的“系统设置”面板，Logo和侧栏设置按钮打开同一窗口，默认桌面管理。左侧184px分类依次为桌面管理、外观设置、采集与诊断、关于 KSF；右侧独立滚动。目标尺寸860×620px，以Logo按钮左边和下边为锚点，菜单和桌面侧栏左边统一距网页8px；Logo入口与侧栏共用48px宽占位，图标中心对齐；随视口和入口尺寸变化重新对齐，右侧与底部至少16px；从左上原点轻量放大展开，减少动态效果时关闭动画；小于640px时分类改为顶部横向导航。实色内容、浅灰分类区、紧凑行距和清晰选中态。外观表单、抽屉材质预览、诊断和关于在窗口内展示，不重复打开同类抽屉。不显示顶部标题栏和关闭叉号，分类区与内容区直接从面板顶部开始；保留仅供辅助技术读取的标题和说明。顶部左右两角为直角，底部保留18px圆角；Escape和遮罩可关闭，恢复打开入口焦点；分类支持方向键与Home/End。关于继续读取运行Core真实版本，失败保留产品信息并提供重试；健康检查只在诊断分类可见时订阅。

KSF整体标识由KsfLogo上下组合：22px原创KsfMark山峰居上，7px KSF字标居中置于山峰下方，整体宽24px、高28px。左侧略低、右侧略高的双峰共用水平基底，无雪线、不镜像。Logo、座右铭、雪山背景和32px顶栏沿用现有设计，顶栏右侧仅日期时间；Dock只保留三个应用和显示桌面，底部70px、距页面底部4px。应用可用区仍从顶栏下沿延伸至Dock上沿，左右贴齐页面。最大化直角填满实际测得的可用区，还原保留位置和大小；普通窗口14px圆角。

桌面卡片区左侧预留64px，栏本体48px、左右8px留白，40px图标按钮。侧栏垂直居中，默认50dvh，按图标数量向上下延长；高度上限为视口高度减288px（极短窗口至少164px），为座右铭和底部Dock留出空间，超过上限仅列表滚动。底部固定新增与设置；悬停和键盘聚焦在右侧显示名称，选中项圆角高亮。侧栏仅桌面显示，应用进入后隐藏，显示桌面恢复上次分组。分组支持名称、图标、上移/下移和确认删除，至少保留一组。编辑未保存时切换提供保存、放弃、继续编辑。应用窗口状态全局独立于分组。

桌面标题区常态96px，座右铭顶端仍在页面52px，横向恢复页面左侧（宽窗28px，窄窗16px），24px字、窄PC窗口22px，辅助文字11px；不显示英文。卡片第0行从页面128px起，相对上一版上移46px。头部与卡片滚动区用弹性布局，窄窗编辑工具换行自然增高，不重复计算固定头部高度。宽屏卡片区两侧距网页均72px，取消重复横向内边距与1536px宽度上限。小于640px时左80px避让侧栏、右16px，保留内容宽度；经典滚动条使用双侧等量预留，避免滚动出现后破坏平衡。基础格保持正方形，横纵间距均24px；以96px为最小目标选择1–12列，将剩余宽度均分到格子，完整铺满可用宽度，没有整格取整后的末尾留白。设可用宽W、列数C，格边长S=(W−(C−1)×24)/C；n×m卡片宽为n×S+(n−1)×24，高为m×S+(m−1)×24，n/m为1–12正整数；默认继续阅读2×2、最近对话4×3、归属概览2×2。名称在卡片底部外侧，4px留白、16px行高，占用格间隙，不挤压卡片尺寸。内容独立滚动，宽或高为1格时切换为可打开应用的紧凑图标入口。编辑时显示与实际格边长一致的正方形参考格和占格尺寸，拖动卡片或名称移动、右下角吸附缩放，也支持方向键移动/Shift＋方向键缩放。窄窗仅投影并填入空位，未编辑不改保存坐标；保存实际编辑结果。卡片库由注册表生成，新增卡片填入当前可见网格的首个可用位置。整个桌面编辑过程暂停网格作用域的玻璃测量、背景对齐和滤镜更新，丢弃已排队的同域工作；卡片采用轻量浅色预览。拖动和缩放中间及松手均不重建材质，点击完成或取消退出编辑后，按最终位置与尺寸合并恢复一次完整玻璃。不逐指针事件更新React桌面状态。像素预览与整数落位分开：拖动和缩放按rAF合并，只刷新正在操作的卡片，格内10px等小位移也连续跟随；占位及松手结果仍按整数格吸附。CardGrid适配react-grid-layout 2.3.0中像素位置保存在ref、GridItem却仅按整数坐标缓存的漏刷新问题，不通过反复更新整个桌面草稿绕过。结束、取消编辑或卸载时取消待执行的刷新，保留碰撞避让、滚动和键盘路径。编辑状态禁用网格及占位过渡，避免跟手延迟；容器观察仅宽度改变时更新网格，忽略高度变化，不触发全局光学同步。暂停跟随React编辑状态生命周期，退出编辑或卸载均恢复，指针取消、失焦与页面隐藏不破坏编辑状态。

桌面偏好使用ksf.workbench.desktop.v2，包含grid: square-v1标识、分组列表、各组布局、当前分组ID及窗口边界。未带正方格标识的旧v1/v2坐标按横向2/3、纵向1/2换算至新格单位并排除重叠，尺寸取正整数；v1迁移为主页。分组、顺序、图标、当前组、空布局与窗口偏好保留，继续过滤退役采集卡；标识随保存写入，避免重复换算，原v1保留作为回退。新分组为空白，主动清空后保持空白；卡片可在不同组独立添加。分组操作自动保存，卡片编辑完成时保存，失败明确“仅本次生效”。

桌面卡片、Dock与状态栏保留可调光学材质；侧栏使用半透明磨砂表面。应用窗口、内部目录、选中项、章节和来源抽屉均为实色，不挂载折射滤镜或背景副本。正文按窗口宽度适配，1100与760两个容器阈值控制三栏/归属抽屉/双目录抽屉。正文15px，轮次标题20px（窄窗18px），导航13px，状态栏12px。系统中文字体离线可用。

减少透明度/增加对比度时提供实色底，减少动态效果关闭动画、位移与回弹。统一模态窗口高于桌面、应用和Dock，记录所属窗口与焦点触发器。下文历史阅读区、光学实现与内容规则继续适用，外壳与系统设置行为以本节为准。

交互期间的材质计算遵循[性能约定](PERFORMANCE.md)：卡片移动按区域合并rAF背景对齐；缩放复用已解码贴图，结束后恢复精确光学。正文与窗口内容更新独立于时钟及无变化轮询。

## Colors

蓝色用于动作和当前位置，冷白纸面承载正文。原创背景src/assets/summit-dawn.jpg包含雪山、登山者和日出云海，不作为业务证据。tint与清晰前景独立；frontmatter透明色以8位hex表达代表值，CSS采用精确的小数alpha。

### Primary

当前聊天标题使用selection-ink（深蓝），轮次归属使用navigation-link；主按钮、轮次数字和文稿链接沿用各自语义色。导航主文为directory-text，辅助字为directory-muted，不沿用强背景下的浅辅助字。

### Material

面板／工作区tint为64%白，当前聊天／轮次72%，阅读工具62%，章节副本为60%白。对比度按这些色层覆盖最暗背景的下界核对，不把上游建议的8–20%白直接当作小号正文可读的证明。章节副本透明，按原始Skill关闭色散，避免预乘alpha发白。不能给前景设置整体透明度或滤镜。

### Neutral and State

paper承载长正文，foreground与muted用于文稿主次文字。directory-text与directory-muted用于透明导航；search-surface是轻微下陷的输入面，focus时提高白面浓度。fallback-surface用于减少透明度与提高对比度偏好。关系、过程、代码、搜索命中、文本选择及异常继续使用已有语义色。

**The Material Color Rule.** 背景、光学、色层与清晰前景分别持有职责，正文不透出背景。

**The State Evidence Rule.** 当前聊天以透镜轮廓和蓝色标题、当前轮次以透镜和数字标记表达，搜索与文本选择保持独立。

## Typography

**Body Font:** frontmatter 的系统字体栈；macOS 使用本机系统中文字体，Windows 回退 Microsoft YaHei，不加载网络字体。
**Label/Mono Font:** 轮次数字与技术原文使用系统等宽字体，时间使用 tabular 数字。

主层级为当前轮次主题、章节、正文、导航和辅助信息，对应 context-title、section、body、navigation、caption（20／19／15／13／12px；窄窗主题18px）。主题字重 600，当前聊天标题为600、当前轮次标题为550。原聊天标题退为辅助来源，正文最大行宽为 72ch，行高由 body 定义。

路由值采用 route-value（14px），正文三级标题采用 body-subheading（17px），按钮采用 button。轮次栏标题为 14px／600，品牌为 24px／700，抽屉标题为 20px。局部“本地”标记保留 11px，它不作为通用辅助字号。小按钮和搜索输入采用 12px。层级来自字号、字重、位置与间距，不使用装饰性展示字体。

**The Reading Hierarchy Rule.** 当前轮次主题优先于聊天原题；正文连续阅读，技术标识才使用等宽字体。

## Layout

默认目录和轮次各 264px。桌面使用本页 Web OS 外壳；应用内部横向内缩8px、间距8px，目录与工作区各自为独立圆角玻璃壳。工作区内轮次栏贴近文稿，文稿外侧留小间隙。目录可在 216–360px、轮次在 220–360px 间调整；上限同时受窗口与另一栏限制，为阅读区保留约 496px。分隔线支持拖动、方向键每次 8px、Shift 加方向键每次 32px，以及 Home／End。轮次栏可收起进入专注阅读。

阅读正文最大宽度为860px，容器居中，普通窗口左右内边距28px；标题区内缩22px。窄窗标题区内缩17px、正文18px，章节与前后轮分为两行。正文段落另受 72ch 行宽限制，代码和宽表格只在自身容器内横向滚动。目录、轮次和正文分别滚动。

应用窗口不超过1099px时，归属进入左侧抽屉；不满760px时轮次也进入抽屉。窗口外壳留白保持不变。阅读容器不超过 760px 时隐藏章节计数；不超过 610px 时压缩章节间距，前后轮以图标呈现；不超过 560px 时路由标签列进一步缩窄。大屏也沿用同一阅读轴线。章节之间留 26px，分隔后留 24px；紧密关联的控件主要采用 3–8px 间距。

**The Reading Axis Rule.** 窗口内阅读保持稳定内缩、清晰层级和受控行宽；专注模式保留正文可读性。

## Elevation & Depth

面板、选中项和按钮使用从原始components.js提取的Surface；背景副本、阴影、tint与前景独立。面板／选中项采用折射24、bezel .3、曲率4、色散.1、blur2、高光.5、宽2px。按钮采用14／.8／3／.12／0／.6／1.5px。原始形状、sRGB、objectBoundingBox与引擎补偿由既有liquid-glass.js保持，不从记忆重写。

Surface为可调透镜预留28px bleed，外壳overflow允许阴影和形变。已知背景采用C图像副本，按真实背景rect注册，滚动和分栏后仍对齐。背景独立成层，亮度、饱和度和构图同时更新真实背景与副本，正文不参与滤镜。地图最长边限制1280px、DPR上限2，尺寸或DPR变化更新形状，移动只对齐；额外观察PC栏容器，修复固定尺寸控件随分栏平移而未重对齐的情况。此上限是工程适配，不是原始默认。

章节采用B装饰副本，只复制三枚已知UI标签，使用折射5、bezel .35、曲率4、色散0、高光.6、宽1.5px。保留原生文档导航语义、aria-current、URL与焦点，不改为单选组件。createSpring采用380／28驱动位置并随速度轻微拉伸；不经React状态逐帧渲染。来源抽屉是D背板，折射为0、blur20；其他引擎可用常规磨砂回退，不声称已跨浏览器验证。

### Shadow and motion

- 面板／按钮仅保留原始Surface的0 4px 12px rgb(0 0 0 / .1)；不叠额外倒角或粗亮边。
- 章节指示器使用0 1px 3px rgb(0 0 0 / .08)。
- 按钮按下使用600／36弹簧，透镜增宽10px、减高4px；选中项轻微增宽4px、减高1.5px。真实文字与命中区域不缩放，不用CSS scale。
- 减少动态效果关闭按压形变；减少透明度／高对比度销毁光学控制器并使用实色。销毁时清理观察器、控件监听、弹簧与滤镜；Surface共享的滚动／resize注册按文档生命周期管理实例集合。

### 本机材质设置

Logo 菜单“外观设置…”提供430px宽的实色侧面板，不加遮罩或模糊，允许继续操作和观察工作台。对象选择及重置操作常驻，参数区独立滚动；关闭和Escape返回触发入口。雪山背景、目录框、工作区背景框、聊天选中、轮次选中、按钮、章节透镜和详情抽屉各自控制。常用光学、色层和形状参数直接展示，曲率／折射率／光照／阴影和适用的弹簧反馈置于“更多参数”。保留章节副本色散为0、抽屉采用磨砂的实现边界。

默认值继续采用上述配方。用户改动即时生效并保存在当前浏览器的材质偏好，支持当前对象和全部恢复；系统辅助偏好优先。任意自定义颜色与透明度不沿用默认配方的对比度结论。设置面板本身保持实色，保证任意参数下仍能调整与恢复。

默认设置对象为“主阅读区”，控制轮次标题、章节栏及请求／路由／结果的统一背景。该区域复用已知背景的Surface，正文和控件保持独立前景；清除遮挡材质的固定白底。默认色层#FDFEFF、100%不透明、磨砂8px、圆角17px，降低不透明度后显现折射和背景。阴影由可调外框绘制以避开内容裁切。原工作区项明确称为外层背景框，避免误认为已经覆盖正文。

详情抽屉未打开时也必须能观察调整：选中该对象后，在设置左侧显示380px宽的实时材质预览，和430px设置面板间留16px；PC窄窗口保持两者在视口内。预览使用实际Sheet类和GlassSurface，照片及示例内容明确标记，不展示业务原文；随参数更新，关闭设置或切换对象时卸载。设置面板的固定实色与被调整的抽屉明确区分。

### Assets, implementation and reference

- 用户指定安装入口：https://liquidglass.dev/install-skill.sh 。使用官方skill-installer将固定提交安装到Codex，不执行远程管道脚本。原始Skill随KSF液态玻璃基本功保存，搭档按任务采用。
- [liquidglass.dev](https://liquidglass.dev/)及[固定提交](https://github.com/gentpan/liquidglass/tree/068ad226f53e1ca62d857f78bdc32f58f3c5fce7)是本版实现依据。原始组件基准保留在.impeccable/review/skill-glass/compare.html。
- src/vendor/liquid-surface.js来自原始Surface，外部CSS来自对应层规则，避免注入style标签；createGlass核心继续使用CSP兼容的CSSOM适配，MIT许可随生产资源打包。React装饰宿主独立，不让第三方组件移动React业务子树。
- 原创雪山背景由内建imagegen生成，PNG原件保留，生产为JPEG；完整提示词在本轮review目录。不是Apple资产、真实登山记录或用户照片。
- 当前截图、源码对照、参数与验证见.impeccable/review/skill-glass/。仅实测当前Chromium IAB；上游三引擎结论不等于本项目已测Safari／Firefox。CSP、离线加载和归档安全边界不扩大。

**The Opaque Document Rule.** 光学处理装饰图像与固定UI标签，归档正文保持实色和正常字形。

## Shapes

外壳采用 shell 圆角（22px），文稿采用 document（17px），抽屉采用 sheet（20px）。聊天与轮次选择为 selection（11px），搜索为 field（10px），常规控件为 control（9px），章节入口为 section-tab 胶囊（999px）。圆角大小随容器尺度变化，保留明显柔和轮廓。

当前轮次数字采用 round-badge（6px），关系与本地标记采用 label（5px），命中词采用 match（3px）。文稿顶部工具为圆形（32px），轮次收起工具为圆形（28px）；品牌图标为 38px 方形加 11px 圆角。演进节点为圆点（7px）加浅蓝外圈，细线连接连续记录。Lucide SVG 保持一致线性风格。

## Components

### Buttons

当前聊天用透镜与深蓝标题表达。阅读工具为两枚独立32px玻璃按钮，轮次收起为28px；使用Surface原始烘焙边缘与接触阴影。按下只改变装饰透镜几何，文字和真实按钮保持稳定；释放回弹。辅助文本按钮不加玻璃。焦点保持深蓝2px可见轮廓，禁用沿用原生语义。

### Inputs / Fields

搜索使用 search-surface 半透明蓝灰底、1px 淡边与轻内阴影。目录高 35px，轮次高 32px。聚焦时增加白面浓度、蓝色内边线与浅蓝光圈；文字和占位保持深色，清空入口沿用原交互。

### Navigation

类别标题只分组。当前聊天是浅色玻璃透镜，标题蓝色600字重、辅助字深色；当前轮次是浅色透镜加蓝色数字，标题最多两行，其他轮次保持紧凑。完整名称保留于可访问名称和提示。

请求／路由／结果组成轻底控制组，UI标签装饰副本在透镜区域呈现，通过弹簧在三项之间滑动。按钮保留aria-current与原有章节跳转、焦点和URL行为，不改成另一套Tab数据模型。记录信息入口与前后轮保持相邻。窄PC阅读容器小于760px时隐藏辅助计数。分栏调整命中与键盘行为不变，焦点细线改为更深蓝。

### Chips

关系、采集和能力阶段使用紧凑文字，普通关系为微圆角与轻色面；轮次行内关系去掉底色。阅读顶部采集状态采用透明背景。警告、错误与阶段始终保留语义文字。暖黄命中词不承担归属或当前选择。

### Reading Containers

请求和结果在同一白色文稿上连续阅读，请求没有额外填色卡片；长请求约八行预览，可展开全文。过程记录折叠后展开为 process-surface 的柔和容器。原文、修订、代码与附件采用局部浅蓝灰面和 10px 圆角。文稿保持阅读轴线与正文行宽。

### Route Evolution

演进线采用浅蓝细线、圆点和对齐信息行。能力名称使用深色，归属链接使用操作蓝，来源与版本退为辅助层级。节点和来源详情进入临时玻璃抽屉；抽屉带遮罩，关闭后焦点返回触发入口。

**The Evidence Row Rule.** 路由变化维持连续信息行，以对齐、细线和留白串联；玻璃和接触阴影不扩散到每一项能力。

## Do's and Don'ts

### Do:

- **Do** 按原始Skill建立同背景基准，保留真正背景副本、原始形状高光、少量接触阴影与弹簧反馈。
- **Do** 区分蓝色标题的当前聊天透镜、带数字标记的当前轮次与白色正文，维持各层文字对比。
- **Do** 在默认、窄 PC 窗口和专注模式中保持标题、章节与正文的统一阅读轴线。
- **Do** 按容器尺度使用柔和圆角，按钮保留短促悬停、按压和可见键盘焦点。
- **Do** 保留实色回退、减少透明度与减少动态效果支持。
- **Do** 使用离线系统中文字体与统一 Lucide 线性 SVG；长文保持 72ch 以内的行宽。

### Don't:

- **Don't** 恢复已被用户否决的钴蓝整块目录、荧黄当前聊天或 paper／stone／night 冷淡平面方向。
- **Don't** 叠自制多圈倒角、凹凸阴影或手写滤镜冒充原始玻璃；不在没有图像输入时只加大blur。
- **Don't** 为每条路由和每项能力增加玻璃卡片、厚阴影或多层边框。
- **Don't** 把浅色辅助字放到低对比材质面，或只靠颜色表达状态；小号白字需覆盖整个渐变区间达到普通文字对比度。
- **Don't** 把原聊天标题提升到当前轮次主题之上，或用导航截断方式处理阅读正文。
- **Don't** 将本轮实现、代码检查或静态审查写成用户验收，也不据此宣称手机端或完整 WCAG 认证通过。
