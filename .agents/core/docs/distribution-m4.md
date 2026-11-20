# 应用与能力分发工具（M4 开发候选）

当前实现说明；业务决定见所属能力和项目 Ax 原件，字段及校验以 SDK/Runtime 程序模型为准。本文不作为运行依赖。以下工具尚未随新 Core 正式发行，官方源门禁须部署到可信默认分支并设置必需检查后才算线上生效。

## 身份和归属

Core 内置九项应用及基础能力用 `ksf` 命名空间，随 Core 更新，不向官方源重复提交。九项为飞轮、文档、仓库、项目、知识、能力、手册、活动监视器、合作。应用载荷在 `applications/builtin`；新实例断网可准备，不预装终端。Core 无官方应用源和能力源离线镜像。已装副本与验证过的请求缓存保留。

场景对象 ID 第二段为实际发布 PR 的 GitHub 用户名。官方源使用独立的 `pull_request_target` 检查，执行可信 base 脚本读取 head 数据，不运行 PR 代码，不以作者字段/Git 署名认证。自定义源和文件包的本地作者声明是未验证身份，SHA256 只校验内容。

## 创建、冻结与持续发布

应用用当前 SDK CLI：

```sh
node <SDK>/scripts/ksf-app.mjs create <工程> --template service --id com.yinbaiyuan.demo --json
node <SDK>/scripts/ksf-app.mjs check <工程> --json
node <SDK>/scripts/ksf-app.mjs build <工程> --store <候选目录> --json
```

源码独立维护；项目/Git 关联可选。先检查构建，再向明确实例试用实际业务流程。候选、安装副本和业务数据分开。正式包和商店资料一起冻结，变更升版；分享同一 `.ksfapp`。本地构建沿既有 local 路线按摘要管理。

自定义 HTTP 源在本地准备完整发布目录，再由开发者托管；工具不自动推送或部署：

```sh
node <SDK>/scripts/ksf-app.mjs publish <发布目录> --source-id my-apps --name 我的应用源 --publisher yinbaiyuan --package <候选.ksfapp> --json
node <SDK>/scripts/ksf-app.mjs verify-source --url https://example.com/apps/index.json --id com.yinbaiyuan.demo --json
```

能力沿现有设计/维护入口建立定义、必要资源和精确依赖；先判断复用、完善或组合，结构检查和实际采用分别核验。`ability-store pack` 的 items 路线生成多来源分组 v2 包；旧 path/ids 源包 v1 仍可读取，未知协议明确要求升级。Core 依赖保持外部精确要求。个人设置、任务数据和操作回执不打包。

```sh
.agents/ksf ability-store publish --data '{"directory":"/tmp/published-abilities","source":{"id":"my-abilities","name":"我的能力源"},"publisher":"yinbaiyuan","packagePath":"/tmp/method.ksfabi"}' --json
.agents/ksf ability-store verify-published --data '{"url":"https://example.com/abilities/index.json","ids":["competency.yinbaiyuan.method"]}' --json
```

发布先写完整内容寻址包和分片，最后原子切换根目录；已存在版本不可改内容。消费者回读校验源、目录、包内身份、版本和摘要，独立于本机构建回执。中断可重跑；明确死亡的发布锁可恢复，无法确认所有者时保留现场。撤回使用 publish 的 withdraw 输入（应用 CLI 为 `--withdraw-id/--version/--reason`）；退出新装/更新候选，历史和已装副本不删除。发布目录里的 `.publication.json` 为作者端历史，不应丢弃后重新建同版本。

## 获取、更新和恢复

应用商店不再将 Core 九项显示为可安装源候选；已安装页明确标识 Core 更新归属。场景应用选择来源、兼容包、权限及数据后安装；运行窗口和在途操作令更新 pending，保存关闭后切换。全部源应用更新由服务端完整已装集合预览，每应用独立返回结果。换源单独预览并核对旧摘要/来源/待切换状态，保留安装身份和数据。

终端新候选为 `com.yinbaiyuan.terminal`。已有 `com.ksf.terminal` 必须显式预览迁移，保存并关闭旧会话后提交；持久 journal 可继续恢复。保留 installationId、启停、业务数据和宿主拥有的入口/归属；业务配置及历史原文不改写。不将旧身份包直接作为新身份的 previous。迁移前快照留在回执目录。

能力包的规范内容身份与分享容器分开。分批 A/B 共享同版同内容 D 时复用 D，保留其已选来源；同版异内容和降低版本拒绝。跨源绑定明确到来源、版本及内容，安装只校验所请求闭包和相关旧版本。真正受影响的反向依赖从已选来源展开；个人旧引用或当前精确工作绑定无法满足时保留旧版并报链路。源必须供应完整非 Core 闭包；跨源 HTTP 联动采用 v2 分组包，旧包不能静默假定跨源闭包支持。

能力更新以当前依赖和共享资源连接成组，独立组分别反馈；全部更新不取当前筛选页。联动组先全部暂存并校验，再一次切换注册表。`preview` 的 action 为 rollback 时预览上一整组代次，提交 rollback 使用同样的 operationId、ifMatch 和 planDigest；已在此后变更的参与源、损坏历史资源、个人或当前工作引用冲突会阻止恢复。保留当前、可恢复和被当前工作引用代次；无法识别的现场不擅自删除。

应用回退校验旧代码与当前业务数据；Core 升级/回滚只切换其拥有的基础应用，并检查场景对象和当前能力绑定。场景后续独立更新保留，不以自动降级解决目标 Core 不兼容。代码回退不等于业务数据可逆。

## 既有官方包与快照工具

官方能力源旧 0.1.1 的 v1 包有 9 处未带齐的 Markdown 资源链接。可信检查只对与 base 字节完全相同的历史归档报告 `historicalIssues`，不改写旧包；新归档仍必须完整。未涉及的旧安装资源缺口不阻断独立安装，选中对象的内容和闭包仍严格核对。

源作者使用 `scripts/snapshot.mjs --ksf-root <开发实例>` 调用公共 `ability-store pack`，显式生成 v2 完整闭包；移除可覆盖历史的 `--initial` 例外。公共 path/ids 打包默认继续提供旧 v1 读取形状，传 `protocol:"ksf-ability-package-v2"` 选择分组包；正文所链接的能力定义一并纳入包，不能只复制未声明的 entry 文件。只在本地准备的修复候选不等于线上发布。
