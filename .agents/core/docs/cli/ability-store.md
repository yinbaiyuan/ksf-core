# 能力商店

桌面的「能力商店」支持按需安装能力，配置自己的HTTP、Git或本地能力源。详情只展示简介、版本、来源和依赖，不要求源作者提供介绍图片。Git/本地作者仓库使用 `ksf-source.yaml` v2；HTTP分发使用 `ksf-store-catalog-v2`，兼容能力包 v1 和新分组 v2。固定默认启用KSF公用能力源，Core不携带该源的离线副本；已装副本可离线使用，未安装内容不参与能力发现。持续发布、共享复用和恢复说明见 [能力组合分发](../ability-distribution.md)。

## 操作与接口

`ksf ability-store catalog --json` 支持 `--query`、`--type`、`--limit`、`--cursor`、`--tab`，每页最多40项，返回 `version`、`revision`、`nextCursor`、缓存状态、能力目录、源状态、安装版本、个人覆盖和待迁移的直接关联源。`detail --data '{"sourceId":"team","id":"partner.author.method"}' --json` 读取单项详情。

所有写入使用 `--from -` 或 `--data JSON`，JSON 包含唯一 `operationId` 与目录返回的 `ifMatch`。相同操作标识重试返回原回执；换请求内容须换标识。状态冲突先刷新、重新预览。

| 操作 | 附加输入 |
| --- | --- |
| source-add / source-edit | kind为http、git或local；location为分片目录入口、Git地址或本地Git根；编辑另带 sourceId |
| source-toggle | sourceId、enabled |
| source-remove / refresh / check | sourceId |
| preview | action 为 install、update、uninstall、copy、migrate 或 rollback；sourceId；除迁移外指定 id，安装和更新也可指定 ids |
| install / update / uninstall / rollback / copy / migrate | 同预览目标，另带预览返回的 planDigest |

安装类操作支持 `--dry-run`，等同于相应 action 的 preview，不写入。HTTP 接口位于 `/api/ability-store/`，catalog/detail/versions 使用 GET，其余使用带工作台会话保护的 POST；共用相同服务和输入。预览返回当前 version、完整操作清单和 planDigest；执行时重新核对源资源和安装状态。

## 版本与资源

添加源只建立目录，不使整库能力生效。安装复制所选对象、必要的同源依赖和资源；Core 依赖仍使用精确版本。运行时只扫描安装清单声明的对象，保留原源 ID；个人定义优先级不变。共享依赖版本变化时，预览列出需一起更新的能力。

HTTP目录按前缀分片和字符索引按需读取，详情及版本历史按对象获取；网络失败使用已验证请求缓存，并标明最新状态尚未确认。固定官方源不可编辑、停用或移除。更新页只查询已安装ID。游标失效时刷新目录重建。

刷新Git源使用托管Git工作树的快进拉取，本地源仅重读当前工作树。刷新和源文件编辑不会改写已安装版本。Git 使用本机凭据；认证或网络失败保留当前安装。停用、移除源均保留安装内容和原仓库。

安装注册表与副本由 Core 保存在实例的 `.agents/user-data/ability-store/`；加锁暂存、校验后原子切换注册表。中断时旧注册表仍指向完整版本，未激活和历史代次保留供恢复。它们不进入 Core 发行包。

个人复制创建同 ID 的个人覆盖，不覆盖已有个人版本，不使用系统派生字段。完整复制所选对象及实际引用资源，不复制同源其他能力；对象依赖继续由已安装项满足。卸载会保护仍被个人或其他能力引用的依赖。

## 与直接关联的关系

`source link` 保留原有整源直接读取机制。能力商店的迁移操作先保存全部现有对象及资源，再以注册表标记接管；旧仓库与关联记录保留用于检查和贡献，运行目录排除重复来源。失败不切换，不改原仓库。迁移后仍可用源命令检查或导出到原仓库，安装与卸载则使用能力商店。

Core 升级与回退会检查安装机制支持和精确依赖。安装、Git 贡献、公开发行及真实任务效果验收分别核对。

实现与验证见运行时的 `services/ability-store.js`、`ability-store/storage.js` 和 `tests/ability-store.test.js`。

## 导入与打包

「KSF能力」左下角的“打包能力”可跨类型多选当前有效定义，个人能力无需导出到能力源。输入包名称，预览自动依赖后下载 `.ksfabi` 文件；详情页“打包此能力”可预选当前项。打包只读取已保存原件，递归包含非Core依赖、能力目录及相对引用资源，移除个人修订字段和 `.upstream` 基线，不携带个人设置。固定入口和归档能力不可打包；来源/精确版本冲突、越界资源、符号链接或超限会阻止生成。预览后内容变化须重新预览。

命令行也可直接打包当前实例中的个人或其他来源能力：

```sh
ksf ability-store pack --data '{"name":"我的能力包","items":[{"id":"partner.author.one","source":"user"},{"id":"competency.author.two","source":"user"}],"output":"/share/team.ksfabi"}' --json
```

直接打包生成独立的包来源身份，按所选ID及实际来源确定，同一组选项更新后保持身份稳定；它不会冒用原始官方或团队源身份。Core精确依赖仍由接收实例提供。

能力商店工具栏的“导入能力包”接受 `.ksfabi` 文件。一包可包含多个能力、同源递归依赖和相对资源；先展示整包计划，确认后原子安装。能力源无需预先添加，来源身份保存在安装记录中。已有个人版本继续优先，低于本机版本、跨源同 ID 或不完整精确依赖会阻止导入。

作者工程保留 `ksf-source.yaml` v2。以结构化输入打包多个能力：

```sh
ksf ability-store pack --data '{"path":"/repo","ids":["partner.author.one","partner.author.two"],"output":"/share/team.ksfabi"}' --json
ksf ability-store preview --data '{"action":"import","packagePath":"/share/team.ksfabi"}' --json
```

再执行 `ability-store import`，同样传入 `packagePath`，并携带预览返回的 `planDigest`、`version`（作为 `ifMatch`）及唯一 `operationId`。API 的 `/api/ability-store/preview` 与 `/api/ability-store/import` 接收 base64 `package`，不读取浏览器提交的本机路径。单包压缩大小最多20MiB，展开JSON最多32MiB，资源总大小最多24MiB。

HTTP分发与手动导入使用同一 `ksf-ability-package-v1`：`sourceId`、显式安装项`roots[]`、`objects[]` 和带路径、权限、大小、SHA-256及内容的 `files[]`。一项能力也使用数组；对象声明须与包内正文身份、版本和定义摘要一致。

## 搭档组合交付

源的`distribution.entries`可将商店入口限制为搭档等发布根，入口通过精确references挂载基本功、数据包，成员随包整体安装更新。`pack`选择入口即可自动打包闭包；多根分享仍可放在同一文件。详情的`available.distribution`与`installed.distribution`记录入口、成员或所属入口，预览保留每个对象的真实ID和版本。来源未配置时保持独立分发兼容。

HTTP目录只需发布入口；v2包已提供完整成员，不逐一下载不存在的成员目录项。全源更新按完整已装范围计算组合及联动组，分页、搜索和隐藏成员不缩减更新范围。共享依赖冲突阻止相关组，其他独立组可继续。旧安装从显式成员转为依赖后，卸载搭档按实际剩余引用清理，个人内容保留。
