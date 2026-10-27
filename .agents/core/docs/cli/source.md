# source 命令

已实现直接关联 Git 能力源、协议检查和本地贡献导出。概念、目录、权限、来源与依赖的唯一规范见[能力源协议](../sources.md)。不提供 Git clone/pull/commit/push 或 PR API 包装；这些由维护搭档在用户请求下使用正常 Git 和已有托管工具完成。

```sh
.agents/ksf source init repositories/team-methods --id team-methods --name "团队方法库" --dry-run --json
.agents/ksf source init repositories/team-methods --id team-methods --name "团队方法库" --json
.agents/ksf source check --path repositories/team-methods --json
.agents/ksf source link repositories/team-methods --json
.agents/ksf source list --json
.agents/ksf source read team-methods --json
.agents/ksf source check team-methods --json
.agents/ksf context capabilities --source team-methods --json
.agents/ksf partner read partner.example.quotation --source team-methods --json
.agents/ksf source export team-methods partner.example.quotation --dry-run --json
.agents/ksf source export team-methods partner.example.quotation --json
.agents/ksf source unlink team-methods --json
```

## 参数、文件影响和结果

init 要求已有独立 Git 工作树；先按请求 repository create 或正常 clone，init 不初始化 Git、不提交。--id/--name 必需，--description 可选。生成声明、建议的 AGENTS.md/README.md 和四类目录占位，保留已有文件；已有相同声明返回无变化，不覆盖不同声明。命令不自动关联。

link 接收本地仓库路径，检查声明、对象、完整资源和本源/Core 依赖后登记；同一 ID/路径重复操作无变化，发生不同映射则要求显式解除旧关联。unlink 接受源 ID，仅移除配置，不删除仓库，允许解除已失联的源。list/read/check 都是本地操作，check 无参数检查所有登记源；--path 检查尚未关联的仓库，与源 ID 互斥。空源合法，read 返回源信息与对象清单，check/list 出错仍保留可核实源及 errors。

export 接受目标源 ID 和个人对象 ID[@精确版本]。更新已有对象时沿用其当前目录，包括中文名称目录；首次导出默认使用完整 ID 目录。可选 --versions JSON 指定本次贡献的对象 ID 到发布版本映射，自动同步包内精确引用，保持个人原稿和派生来源版本不变。自动包含匹配的必要个人依赖；已满足的本源/Core 依赖保持引用。提供目录、完整文件清单和 removed_files 供定向审查；已有目标对象存在未处理 Git 差异时返回 SOURCE_TARGET_DIRTY，保留用户改动；移除个人基线和修订标记。拒绝其他源依赖、对象外相对资源、受保护对象、同发布版本的内容变更、破坏既有引用或并发编辑。已有目标资源随本次整个对象贡献一起审查；无变化不重写。

init/link/unlink/export 支持 --dry-run，命令本身不写文件、目标目录或锁；公共启动仍可能准备随包 Node。所有命令支持 --json、两级 --help/-h，未知/重复/缺值/不适用参数报错，-- 结束选项。相对路径统一基于 KSF 根，与进程 cwd 无关。Windows 仍受现有运行时支持边界限制。

输出使用 `{ok,command:"source",operation,data,errors}`，stdout 为业务结果，stderr 留给启动与底层诊断；退出 0 成功、1 执行或协议失败、2 参数错误。修改结果包含 dryRun/changed/wouldChange；仅 export changed=true 表示本地文件已准备，不表示已提交 Git 或创建 PR。

常见错误包含 SOURCE_NOT_DECLARED、SOURCE_DECLARATION_INVALID、SOURCE_VERSION_UNSUPPORTED、SOURCE_ID_CHANGED、SOURCE_ID_CONFLICT、SOURCE_REPOSITORY_INVALID、SOURCE_INVALID、SOURCE_AMBIGUOUS、SOURCE_DEPENDENCY_INVALID、SOURCE_RESOURCE_EXTERNAL、SOURCE_VERSION_REQUIRED、SOURCE_LOCKED、SOURCE_CONFLICT。文件/编码/对象和 user-data 错误沿用原契约。

## 验证入口

[sources.test.js](../../runtime/tests/sources.test.js) 覆盖协议、关联、当前工作树、多源和导出；[sources-distribution.test.js](../../runtime/tests/sources-distribution.test.js)覆盖发行隔离与真实入口。现有对象、context、user-data 和分发测试验证兼容。真实远程 PR 不由本地测试代替。
