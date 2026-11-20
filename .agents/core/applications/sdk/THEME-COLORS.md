# 浅深主题公共配色

由 `src/theme.ts` 生成，修改配色后执行 `npm run theme:generate`；`npm run theme:check` 核对一致性。仅两套颜色主题，system 表示跟随系统，并非第三套配色。

SDK 新组件与应用共用 `--ksf-color-*`；React 内联样式可用 `themeVars`，需要原始值时读取 `themeColors.light`／`dark`。完整接入说明见 [SDK README](README.md#公共主题颜色)。

| 用途 | CSS 变量 | 浅色 | 深色 | 使用说明 |
| --- | --- | --- | --- | --- |
| 内容背景 | `--ksf-color-background` | `#ffffff` | `#242424` | 应用主要内容区域 |
| 分区背景 | `--ksf-color-surface` | `#f5f6f8` | `#282828` | 与主背景区分的内容分区 |
| 浮层背景 | `--ksf-color-surface-raised` | `#ffffff` | `#2c2c2c` | 菜单、弹层或抬高的内容表面 |
| 正文文字 | `--ksf-color-foreground` | `#1b1b1b` | `#ffffff` | 标题和主要正文 |
| 辅助文字 | `--ksf-color-muted-foreground` | `#5c5c5c` | `#c5c5c5` | 说明、次要信息；仍需清晰可读 |
| 轻边界 | `--ksf-color-border` | `#0000000f` | `#ffffff15` | 装饰分隔；不单独承担交互控件识别 |
| 交互边界 | `--ksf-color-border-strong` | `#858585` | `#898989` | 需要明确识别的控件轮廓 |
| 主操作色 | `--ksf-color-primary` | `#005fb8` | `#60cdff` | 主要操作、链接或强调文字 |
| 主色上文字 | `--ksf-color-on-primary` | `#ffffff` | `#000000` | 仅用于实色主操作背景上的文字 |
| 主色浅底 | `--ksf-color-primary-surface` | `#e0eaf3` | `#2e393e` | 轻量强调背景，搭配主操作色文字 |
| 焦点轮廓 | `--ksf-color-focus-ring` | `#005fb8` | `#60cdff` | 键盘焦点的可见轮廓 |
| 选区背景 | `--ksf-color-selection` | `#e0eaf3` | `#2e393e` | 选中的文字或项目背景 |
| 选区文字 | `--ksf-color-selection-foreground` | `#1b1b1b` | `#ffffff` | 搭配选区背景使用 |
| 成功文字 | `--ksf-color-success` | `#0f7b0f` | `#6ccb5f` | 成功信息的文字或图标 |
| 成功背景 | `--ksf-color-success-surface` | `#dff6dd` | `#393d1b` | 搭配成功文字的浅底 |
| 警告文字 | `--ksf-color-warning` | `#9d5d00` | `#fce100` | 需要注意的信息文字或图标 |
| 警告背景 | `--ksf-color-warning-surface` | `#fff4ce` | `#433519` | 搭配警告文字的浅底 |
| 危险文字 | `--ksf-color-danger` | `#c42b1c` | `#ff99a4` | 错误或危险操作的文字与图标 |
| 危险背景 | `--ksf-color-danger-surface` | `#fde7e9` | `#442726` | 搭配危险文字的浅底 |
| 提示文字 | `--ksf-color-info` | `#005fb8` | `#60cdff` | 普通提示信息的文字或图标 |
| 提示背景 | `--ksf-color-info-surface` | `#e0eaf3` | `#2e393e` | 搭配提示文字的浅底 |
| 遮罩 | `--ksf-color-scrim` | `#0000004d` | `#0000004d` | 内容遮罩，不用作正文背景 |

正文、辅助文字与主操作文字在背景／分区／浮层上按 4.5:1 核对；主色上文字、选区与语义色使用表中规定的搭配。交互边界与焦点轮廓按 3:1 核对；轻边界只用于装饰分隔。透明遮罩不作为正文底色。组件最终的可读性仍取决于实际字号、背景、层级和使用方式。
