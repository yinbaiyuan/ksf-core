# Manifest、构建与安装包

## v2 清单

```json
{
  "schemaVersion":2,"sdkVersion":2,
  "id":"com.example.review","name":"核对应用","description":"整理并核对材料","version":"1.0.0",
  "author":"Example","icon":"package",
  "window":{"entry":"frontend/index.js","multiInstance":true,"defaultSize":{"width":900,"height":640},"minSize":{"width":480,"height":320}},
  "cards":[{"id":"summary","name":"摘要","description":"当前业务摘要","entry":"frontend/cards/summary.js","styles":[],"defaultSize":{"w":2,"h":2},"minSize":{"w":1,"h":1}}],
  "backend":{"runtime":"node","entry":"backend/index.mjs"},
  "background":false,"permissions":["ai"]
}
```

| 字段 | 约束/默认 |
| --- | --- |
| schemaVersion/sdkVersion | schemaVersion 为 2；sdkVersion 可为 2 或 3，新 CLI/通信/持久保活要求 3；SDK 包版本与协议整数分别管理 |
| id | 全局稳定小写标识，建议反向域名；当前语法2—80字符，以字母开头，允许数字、点、短横线，不允许连续点及保留词 |
| name/description | 必填；名称1—80字符，说明最多2000字符 |
| version | 三段无前导零的非负安全整数 major.minor.patch，不接收预发布标签；同版本不能换内容 |
| window/cards | 至少一项；无窗口不进Dock；最多64种卡片，卡片ID在应用内唯一 |
| entry/styles | 前端ESM与CSS在frontend/，不允许越界、反斜线、符号链接；所有声明入口必须在包中 |
| multiInstance | 布尔值，省略为true；false只控制窗口，不禁止同类型多张卡片 |
| window尺寸 | CSS像素整数1—16384，两者均显式声明时默认尺寸不小于最小尺寸；显示宽高另受宿主320—2000/240—1600范围约束。省略采用宿主默认1000×680及480×320，实际显示受可用空间约束 |
| card尺寸 | w/h为1—12整数网格数，defaultSize/minSize必填；不是像素 |
| backend | 可省略；现有运行时为node，入口在backend/ |
| background | 可选布尔值，true必须有v2后端、background能力及startBackground方法；省略为false |
| permissions | 字符串数组；常见filesystem、shell、network、environment、background、ai，安装时展示 |
| target/nodeAbi | 平台二进制需要target，如darwin-arm64；依赖Node ABI时声明nodeAbi字符串，Node-API是否免绑定须实际验证 |

可选 author/icon 为显示信息；图标未识别时使用通用图标。纯前端应用不需要后端。后台仍需主窗口或至少一种卡片，首版不提供纯后台安装单元。

## 源码与产物入口

默认源码为 frontend.tsx、`<cardId>.tsx` 和 backend.mjs。构建器将窗口输出为 index.js，卡片输出为 cards/<id>.js，因此名为 index 的卡片不会覆盖窗口。多个界面可有意复用同一ESM模块，逻辑ID必须唯一。

需要其他目录时创建 ksf-build.json：

```json
{"entries":{"window":"src/window.tsx","cards":{"summary":"src/summary.tsx"},"backend":"src/backend.mjs"}}
```

构建后由工具收集CSS与依赖资源，并为CSS选择器/关键帧加应用版本命名空间，源码清单不能假装已有编译产物。必须构建掉TS、JSX及浏览器裸模块引用。后端依赖打入Node ESM；原生依赖需要专门构建并随包携带，不能依靠用户机器运行npm或编译。

## 包与完整性

.ksfapp 是gzip JSON，protocol=ksf-app-package-v1，包含manifest及files。files包含base64 content、mode和sha256。最大包32 MiB、展开96 MiB、2000文件；前后端全部在包内。安装器拒绝越界、大小写冲突、完整性错误、缺入口及平台/SDK不兼容。

打包器检查静态前端依赖和CSS资源引用；动态表达式、外部业务网络行为仍需验收。SHA256证明内容与索引一致，不证明发布者身份或代码安全。源码不得携带真实凭据、私人样本或实例数据。

## SDK v3：CLI 与消息激活

应用可选的 `cli` 声明及包内实现/文档，以[应用 CLI](cli.md#包声明与交付内容)为契约主件；`activation.messages` 及路由授权见[通信与工作流](communication.md#消息路由与接管)。这些能力要求 sdkVersion:3 和 Node 后端，旧宿主会明确拒绝。

应用包需完整包含 CLI 入口、说明、schema 与运行依赖，安装校验其存在性、引用边界和摘要，安装/读文档不执行 CLI。CLI 代码、命令声明和文档随同一不可变包升级；构建器检查静态依赖和文档引用；安装器检查清单、路径、文件摘要及声明入口。本节不改变现有包格式、容量及窗口/卡片要求。
