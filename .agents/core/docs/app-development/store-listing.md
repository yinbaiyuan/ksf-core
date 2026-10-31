# 商店展示资料与最新版本

**SDK v1 展示资料。** 商店资料位于应用源条目的可选`listing`，不进入Manifest或`.ksfapp`。应用源索引与执行包分别管理；素材缺失时使用内置图标和Manifest说明。

## 开发工程

可选`store-listing.json`示例：

```json
{
  "subtitle": "一句话说明应用用途",
  "description": "完整介绍。支持换行，按纯文本展示。",
  "icon": {"path": "store-assets/icon.png", "alt": "应用图标"},
  "screenshots": [
    {"path": "store-assets/overview.png", "alt": "项目概览，使用虚构数据"}
  ],
  "releaseNotes": "当前版本的改进与修复。"
}
```

| 字段 | 输入、默认和约束 |
| --- | --- |
| subtitle | 可选字符串，最多120字符；缺失用Manifest简述 |
| description | 可选字符串，最多12000字符；缺失用Manifest说明 |
| icon | 可选本地路径字符串或`{path,alt?}`；缺失使用宿主内置图标 |
| screenshots | 可选数组，最多8张，元素`{path,alt}`；空数组隐藏预览区 |
| releaseNotes | 可选字符串，最多8000字符；缺失隐藏新内容区 |

所有内容必须反映该版本实际能力，不编造评分、下载量或尚未实现的功能。截图使用虚构资料，不包含用户实例内容、密钥和其他应用的私人信息。必须为截图提供有意义的替代文字。

图片仅支持PNG、JPEG、WebP，每张最多8 MiB；路径必须位于工程内部，父目录链接不得越界。构建器读取文件头检查格式，使用SHA256命名为`media/<sha256>.png|jpg|webp`。索引中的图片是`{url,sha256,size,alt?}`，url必须是该内容摘要路径，size单位字节。不要把本地path写入正式索引。

## 检查和发布

```sh
npm run check
npm run build -- --store ../store
# 仅更新已发布版本的商店资料，无需编译、打包或改变执行包
npx --no-install ksf-app build . --listing-only --store ../store --json
```

`check`的输入是工程目录，输出人类/JSON诊断；非法字段、图片、容量或路径是阻断错误。`build`先校验，发布不可变包及图片，再原子更新索引。`--listing-only`需要存在对应ID/版本的本地包和索引，重新校验包摘要和Manifest；结果返回更新条目，覆盖该版本全部平台变体的展示资料。没有版本报`APP_RELEASE_MISSING`，非法素材报`APP_LISTING_INVALID`；失败不改变原索引和包。下载源部署时同步部署media目录。

展示文本或截图变化允许更新同版本listing；执行代码或Manifest变化仍必须递增应用版本。展示资料与可执行包独立核对。

## 浏览与安装规则

`GET /api/apps/catalog`保留原始`apps/errors`，新增`applications`。每项包括`appId`、`display:{manifest,source,listing?}`、`candidate`（最新兼容StoreEntry或null）、`latestPublishedVersion`、`unavailableReason`。客户端不得把原始版本数组直接画成应用列表。

未安装时选择已启用源的最高兼容版本；同版优先默认源及源配置顺序。已安装时仅跟随原源；源失效仍保留本地应用，不自动换源。平台/ABI专用且匹配的变体优先通用变体。低于本地或pending的版本不可用于常规安装；已有故障恢复操作独立保留。

`POST /api/apps/install`沿用`{appId,sourceId,version,digest,trusted:true}`。服务端复核最新兼容版本和来源；旧确认报409 `APP_RELEASE_CHANGED`，来源改变报409 `APP_SOURCE_CHANGED`，应用应刷新并重新确认，不能自动替换目标后继续安装。更新保留停用状态；旧窗口和任务仍按租约规则延迟切换。没有自动更新或批量信任。

`GET /api/apps/media?sourceId=...&appId=...&version=...&digest=...`返回已在当前启用源声明、通过摘要与容量校验的图片及正确MIME，不接受任意URL或本机路径。失败用图标/占位恢复，不阻断应用安装。图片缓存不包含模型凭据或业务数据。

## CLI 能力标识

宿主依据页面所展示版本的 `manifest.cli` 自动显示“支持 CLI”，不读取 listing 文案作为能力声明。已安装列表采用当前生效包；详情、候选及安装/导入预览各跟随展示的包版本。已安装应用的详情另提供当前安装版本的 CLI 文档入口，即使停用、纯后台或仅有卡片也可阅读。未安装只展示标识，不下载文档包。见 [CLI 文档标准](cli.md#商店标识与标准文档入口)。
