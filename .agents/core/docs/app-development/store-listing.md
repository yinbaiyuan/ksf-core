# 商店资料与统一应用包

应用源码使用固定的 `store/` 目录维护商店文案、图标和截图。构建生成一个 `ksf-app-package-v2` 的 `.ksfapp`，程序和商店资料共同参与包摘要；分享或导入这个包即可携带完整资料。

## 工程结构

```text
manifest.json
frontend.tsx
store/
  listing.json
  icon.png
  screenshots/
    overview.png
```

`store/listing.json` 示例：

```json
{
  "subtitle": "一句话说明应用用途",
  "description": "该版本的完整介绍。",
  "icon": {"path": "icon.png", "alt": "应用图标"},
  "screenshots": [{"path": "screenshots/overview.png", "alt": "使用虚构数据的应用概览"}],
  "releaseNotes": "该版本的改进。"
}
```

路径相对 `store/`，不得越界或经过链接。图片支持PNG、JPEG和WebP，每张不超过8 MiB，最多8张截图；截图必须有有意义的alt。subtitle、description、releaseNotes分别限制120、12000、8000字符。资料缺失时使用Manifest说明和宿主图标。截图和介绍只陈述该版本的实际功能，不携带私人实例资料。

## 构建与发布

`ksf-app check . --json` 校验资料和资源；`ksf-app build . --store ../store --json` 生成统一包。生成的包固定包含 `store/listing.json` 和声明的图片。包内资料中的图片引用记录包内路径、大小和SHA-256，安装和读取均复核。修改文案或图片同样需要递增应用版本并重打包，同版本不能替换内容。

发布源按单个应用、单个版本保存包引用，CI从完整包生成 `ksf-store-catalog-v2`。图片属于包内资源，不需要独立发布media目录。目录摘要不包含完整声明；安装确认必须先调用预览接口读取实际兼容版本及权限。

## 商店接口

`GET /api/apps/catalog` 接受query、type、limit、cursor、tab，返回revision、摘要applications、nextCursor、errors和directories缓存状态。每页最多40项。翻页时修订号变化返回 `STORE_CURSOR_EXPIRED`，客户端刷新并重建游标。

`GET /api/apps/detail?appId=...` 按ID读取详情；`GET /api/apps/versions?appId=...&sourceId=...` 分页读取版本。`POST /api/apps/preview` 返回实际兼容版本的完整声明和数据检查。安装继续要求来源、版本、摘要与明确的信任确认，旧确认或来源变化均拒绝。

`GET /api/apps/media?sourceId=...&appId=...&version=...&digest=...` 从校验后的统一包或已安装副本中读取图片。详情图片按需加载，首页不下载全部应用包。已安装图片可离线读取；桌面图标从安装记录取得，不扫描全目录。

更新只检查已安装ID并保持原安装来源；刷新目录不会自动更新程序。网络失败使用已验证缓存或Core随包资源，并标明最新状态尚未确认。旧公共目录格式和分离素材发布流程不再支持。

## CLI标识

“支持CLI”由展示版本的 `manifest.cli` 决定，介绍文案不能代替契约。已安装版本的CLI文档入口遵循[CLI文档标准](cli.md#商店标识与标准文档入口)。
