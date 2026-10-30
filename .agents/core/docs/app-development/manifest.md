# Manifest、构建与安装包

## 新 v1 清单

```json
{
  "schemaVersion": 1,
  "sdkVersion": 1,
  "minCoreVersion": "0.3.2",
  "dataStores": [{"name":"state.json","scope":"user","schemaVersion":1,"migrateFrom":[]}],
  "id": "com.example.review",
  "name": "核对应用",
  "description": "整理并核对材料",
  "version": "1.0.0",
  "author": "Example",
  "icon": "package",
  "window": {
    "entry": "frontend/index.js",
    "multiInstance": true,
    "defaultSize": {
      "width": 900,
      "height": 640
    },
    "minSize": {
      "width": 480,
      "height": 320
    }
  },
  "cards": [
    {
      "id": "summary",
      "name": "摘要",
      "description": "当前业务摘要",
      "entry": "frontend/cards/summary.js",
      "styles": [],
      "defaultSize": {
        "w": 2,
        "h": 2
      },
      "minSize": {
        "w": 1,
        "h": 1
      }
    }
  ],
  "backend": {
    "runtime": "node",
    "entry": "backend/index.mjs",
    "lifecycle": "on-demand"
  },
  "permissions": [
    "ai"
  ]
}
```

| 字段 | 约束/默认 |
| --- | --- |
| schemaVersion/sdkVersion | schemaVersion 与 sdkVersion 均为 1；SDK 包从 1.0.0 起步，使用完整新契约 |
| minCoreVersion | 必填明确三段版本号，如0.3.0；不是范围表达式。商店、离线导入、启动和回退共用检查 |
| dataStores | 必填数组；无受管数据填[]。每项name/scope/schemaVersion/migrateFrom均必填，scope为user或runtime，schemaVersion为正整数；migrateFrom只列不同的较低正整数来源。最多64项，范围加文件名唯一 |
| id | 必须为 `com.<发布者命名空间>.<应用名>`，恰好三段、首段固定 `com`、总长≤80；后两段以小写字母开头，仅小写字母、数字及段内连字符，连字符不能连续或结尾。例 `com.yinbaiyuan.camp-tasks`。`com.ksf.app-store` 为宿主保留，不可用于安装包 |
| name/description | 必填；名称1—80字符，说明最多2000字符 |
| version | 三段无前导零的非负安全整数 major.minor.patch，不接收预发布标签；同版本不能换内容 |
| window/cards | 可同时省略，但需要后端；无窗口不进Dock；最多64种卡片，卡片ID在应用内唯一，沿用独立短ID规则，如 `work-stats`，不要求com前缀 |
| entry/styles | 前端ESM与CSS在frontend/，不允许越界、反斜线、符号链接；所有声明入口必须在包中 |
| multiInstance | 布尔值，省略为true；false只控制窗口，不禁止同类型多张卡片 |
| window尺寸 | CSS像素整数1—16384，两者均显式声明时默认尺寸不小于最小尺寸；显示宽高另受宿主320—2000/240—1600范围约束。省略采用宿主默认1000×680及480×320，实际显示受可用空间约束 |
| card尺寸 | w/h为1—12整数网格数，defaultSize/minSize必填；不是像素 |
| backend | 可省略；现有运行时为node，入口在backend/ |
| backend.lifecycle | 后端必填 on-demand 或 resident；resident 要求 background 权限及 startBackground() |
| permissions | 字符串数组；常见filesystem、shell、network、environment、background、ai，安装时展示 |
| target/nodeAbi | 平台二进制需要target，如darwin-arm64；依赖Node ABI时声明nodeAbi字符串，Node-API是否免绑定须实际验证 |

可选 author/icon 为显示信息；图标未识别时使用通用图标。纯前端应用不需要后端。支持没有窗口和卡片的纯后台安装单元。

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

## SDK v1：CLI 与消息激活

应用可选的 `cli` 声明及包内实现/文档，以[应用 CLI](cli.md#包声明与交付内容)为契约主件；`activation.messages` 及路由授权见[通信与工作流](communication.md#消息路由与接管)。这些能力要求 sdkVersion:1 和 Node 后端，旧宿主会明确拒绝。

应用包需完整包含 CLI 入口、说明、schema 与运行依赖，安装校验其存在性、引用边界和摘要，安装/读文档不执行 CLI。CLI 代码、命令声明和文档随同一不可变包升级；构建器检查静态依赖和文档引用；安装器检查清单、路径、文件摘要及声明入口。包格式和容量上限保持，界面可选，后台生命周期必须显式声明。

本轮新契约以[SDK v1 生命周期](lifecycle.md)为准：清单 schemaVersion/sdkVersion 均为 1，后端必须声明 lifecycle；无旧协议兼容。后台管理见[运行服务](../runtime/service.md)。

## 受管数据声明

普通 JSON 与 SDK 封装均使用顶层 `schemaVersion`，保留业务文件结构。声明固定文件名（字母、数字、下划线或短横线加.json），不匹配目录或任意用户文档；有声明必须有后端。安装检查不创建缺失文件。未知、损坏或较新格式会阻止相关应用就绪。`migrateFrom` 非空时，后端必须导出 `prepareData(context)`；打包器和运行宿主均核验。转换与业务校验由应用负责，详情见[数据与迁移](backend-data.md)。

## 应用工作流

Core 0.3.5 起，应用可声明 `workflows: {contractVersion: 1}`，需要 Node 后端和 background 权限。发起合作任务另需 cooperation.request；提供应用自行实现固定工作流方法和持久等待点。workflows.invoke 仅供KSF合作受控调用。完整字段、事件确认及材料约定见[应用工作流与合作任务回调](workflows.md)。
