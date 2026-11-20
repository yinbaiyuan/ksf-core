# 契约与工具定位

这些是当前实现的查找入口。先确认实际 SDK 和目标 KSF，再读本次用到的字段；不全量加载全部手册，不固定沿用示例里的版本。

| 条件 | 一手契约与程序 | 说明入口 |
| --- | --- | --- |
| 身份、版本、公共模块 | [SDK 包声明](../../../../applications/sdk/package.json)、[SDK 协议](../../../../applications/sdk/server/protocol.js) | [Manifest](../../../../docs/app-development/manifest.md)、[兼容](../../../../docs/app-development/sdk-compatibility.md) |
| 构建、检查与本地安装命令 | [SDK CLI](../../../../applications/sdk/scripts/ksf-app.mjs)、[本地构建入口](../../../../applications/sdk/server/local-application.mjs) | [SDK 使用说明](../../../../applications/sdk/README.md) |
| 组件查找、契约、示例及目标支持 | [SDK组件数据](../../../../applications/sdk/components/)、[查询实现](../../../../applications/sdk/server/components/query.mjs)、[公共目录](../../../../applications/sdk/src/component-catalog.js) | [Agent组件查询](../../../../applications/sdk/COMPONENTS.md) |
| 存储与生命周期 | [SDK 源码](../../../../applications/sdk/src/)、所选模板及类型 | [数据](../../../../docs/app-development/backend-data.md)、[生命周期](../../../../docs/app-development/lifecycle.md) |
| 窗口、卡片、CLI、通信、AI | SDK package exports 中对应模块及实际宿主返回 | [技术手册](../../../../docs/app-development/README.md) 中对应章节 |

当前支持 local 的工程可将 npm 脚本分为 check、build（`ksf-app local . --build-only`）、local（`ksf-app local .`）和 build:release（`ksf-app build .`）。这只是已有工具入口的示意，先检查实际脚本，不能把任意项目的 build 都当作无安装或发布作用。

ksf-local.json 的 workspace 指向明确的本机 KSF，按应用目录解析；project、repository 可省略。`.ksf-local/`、本机配置、用户数据和凭据不进入公共源码快照。直接安装 .ksfapp 不需要这些关联文件。只有公共 SDK 与目标宿主确实支持 local 时才调用，缺支持不能改用私有 HTTP 旁路。

组件按实际需求逐个积累：当前 SDK 已有且适合的组件可以默认引用，无需用户逐次显性指定；应用仍可自主选择其他组件库和渲染依赖。当前新入口是基础布局 `@ksf/sdk/view` 与基础按钮 `@ksf/sdk/button`，完整示例在 `applications/component-library/`。Button消费公共主题变量，不另订阅或覆盖宿主；原生button/ref与显式提交由应用接入。使用前核对目标 SDK 的实际 exports，不从旧 M10 设计稿猜测可用组件，不恢复已撤回的 `@ksf/sdk/ui` 或强制共享 renderer。组件与样式随应用打包，遵守窗口归属、清理和 CSS 作用域；旧 `components/ui/button` 仅保留原接口兼容。

公共配色通过 `@ksf/sdk/theme` 与可选 `@ksf/sdk/theme.css` 提供。SDK 新组件优先消费 `--ksf-color-*`／`themeVars`，不复制色值；应用可选同一机制。View 自动建立宿主主题范围，普通DOM可用bindTheme并在dispose中释放。浅深配色的原始值及变量以SDK `src/theme.ts`为准，生成CSS与配色表不得独立维护；应用不需要生成器。只提供light/dark两套颜色，system为跟随方式，不引入密度、动效或控件状态矩阵。
