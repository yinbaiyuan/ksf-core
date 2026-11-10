# 能力商店

桌面的「能力商店」支持按需安装能力，配置自己的HTTP、Git或本地能力源。详情只展示简介、版本、来源和依赖，不要求源作者提供介绍图片。Git/本地作者仓库使用 `ksf-source.yaml` v2；HTTP分发使用 `ksf-store-catalog-v2` 及 `ksf-ability-package-v1`。固定默认启用KSF公用能力源，Core随包提供12项精选离线资源；未安装内容不参与能力发现。

## 操作与接口

`ksf ability-store catalog --json` 支持 `--query`、`--type`、`--limit`、`--cursor`、`--tab`，每页最多40项，返回 `version`、`revision`、`nextCursor`、缓存状态、能力目录、源状态、安装版本、个人覆盖和待迁移的直接关联源。`detail --data '{"sourceId":"team","id":"partner.author.method"}' --json` 读取单项详情。

所有写入使用 `--from -` 或 `--data JSON`，JSON 包含唯一 `operationId` 与目录返回的 `ifMatch`。相同操作标识重试返回原回执；换请求内容须换标识。状态冲突先刷新、重新预览。

| 操作 | 附加输入 |
| --- | --- |
| source-add / source-edit | kind为http、git或local；location为分片目录入口、Git地址或本地Git根；编辑另带 sourceId |
| source-toggle | sourceId、enabled |
| source-remove / refresh / check | sourceId |
| preview | action 为 install、update、uninstall、copy 或 migrate；sourceId；除迁移外指定 id，安装和更新也可指定 ids |
| install / update / uninstall / copy / migrate | 同预览目标，另带预览返回的 planDigest |

安装类操作支持 `--dry-run`，等同于相应 action 的 preview，不写入。HTTP 接口位于 `/api/ability-store/`，catalog/detail/versions 使用 GET，其余使用带工作台会话保护的 POST；共用相同服务和输入。预览返回当前 version、完整操作清单和 planDigest；执行时重新核对源资源和安装状态。

## 版本与资源

添加源只建立目录，不使整库能力生效。安装复制所选对象、必要的同源依赖和资源；Core 依赖仍使用精确版本。运行时只扫描安装清单声明的对象，保留原源 ID；个人定义优先级不变。共享依赖版本变化时，预览列出需一起更新的能力。

HTTP目录按前缀分片和字符索引按需读取，详情及版本历史按对象获取；网络失败使用已验证缓存或离线基线，并标明最新状态尚未确认。固定官方源不可编辑、停用或移除。更新页只查询已安装ID。游标失效时刷新目录重建。

刷新Git源使用托管Git工作树的快进拉取，本地源仅重读当前工作树。刷新和源文件编辑不会改写已安装版本。Git 使用本机凭据；认证或网络失败保留当前安装。停用、移除源均保留安装内容和原仓库。

安装注册表与副本由 Core 保存在实例的 `.agents/user-data/ability-store/`；加锁暂存、校验后原子切换注册表。中断时旧注册表仍指向完整版本，未激活和历史代次保留供恢复。它们不进入 Core 发行包。

个人复制创建同 ID 的个人覆盖，不覆盖已有个人版本，不使用系统派生字段。完整复制所选对象及实际引用资源，不复制同源其他能力；对象依赖继续由已安装项满足。卸载会保护仍被个人或其他能力引用的依赖。

## 与直接关联的关系

`source link` 保留原有整源直接读取机制。能力商店的迁移操作先保存全部现有对象及资源，再以注册表标记接管；旧仓库与关联记录保留用于检查和贡献，运行目录排除重复来源。失败不切换，不改原仓库。迁移后仍可用源命令检查或导出到原仓库，安装与卸载则使用能力商店。

Core 升级与回退会检查安装机制支持和精确依赖。安装、Git 贡献、公开发行及真实任务效果验收分别核对。

实现与验证见运行时的 `services/ability-store.js`、`ability-store/storage.js` 和 `tests/ability-store.test.js`。
