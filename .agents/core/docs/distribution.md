# 发行、升级与贡献

KSF 分为系统、用户模板和用户实例三层：

| 名称 | 承接内容 | 发行与使用方式 |
| --- | --- | --- |
| `ksf-core` | KSF 系统：运行程序、系统能力、协议、文档、测试和模板源 | 唯一系统开发源，发布系统更新包 |
| `ksf-workspace` | KSF 用户模板：随包系统、空的用户目录、初始说明和忽略规则 | 从 ksf-core 构建，发布模板目录、模板压缩包及官方模板仓库 |
| `ksf` 或用户自定义名称 | 真正的 KSF 用户实例，保存该用户的项目、知识、能力及配置 | 复制/解压模板或从模板创建私有仓库后使用；实例名称不进入系统版本身份 |

三种身份的程序定义统一位于 [products.js](../runtime/src/distribution/products.js)。命令入口仍为 `.agents/ksf`，不随用户实例目录或仓库名称变化。

Agent 入口为 AGENTS.md → `context entry` → Core 孵化指导或 [ksf-runtime](../abilities/partners/ksf-runtime/partner.md) → ability-route；孵化状态由实例保存，新模板只带通用 pending 初始状态，旧实例缺失时进入正常 runtime。状态切换不修改 Core 或 AGENTS，规则见[孵化接口](cli/incubation.md)。系统维护选择 [ksf-maintainer](../abilities/partners/ksf-maintainer/partner.md)，按发布、创建工作区、升级或贡献基本功执行。检查、安装和公开提交分别核对用户要求，不因发现新版本而安装。

Core 源码不保留用户根目录或占位文件；ksf-workspace 模板的项目、知识、能力、收件箱和档案目录由发行程序生成，不再创建根级 `源档/`。原件随目标保存，默认使用目标的 `资料/`，已有附属资料目录保持原位；一份原件一个主归属，其他目标引用。Core 源码中的能力发现允许用户目录不存在；模板和用户实例仍检查用户能力目录的完整性。`repositories/` 是可选的用户工程容器，首次使用 repository create 时建立，不生成受跟踪占位文件；模板忽略规则排除整个容器。已有实例启用时需在其自己的 .gitignore 中补 `/repositories/`，升级继续保留用户忽略规则。

升级及回滚只处理系统管理范围，继续保留旧实例已有 `源档/` 中的数据，不自动迁移或删除。发行校验兼容旧工作区包中已知、字节为空且权限为 `0644` 的 `源档/.gitkeep`；未知额外文件、非空占位符及权限异常仍拒绝。这项兼容不使新模板重新生成该目录。

## 开始使用

文件夹分发：将 `ksf-workspace-<版本>-<平台>.tar.gz` 解压到名为 `ksf` 或用户自定义名称的空目录，用 Agent 打开并读取根 AGENTS.md；也可复制构建生成的 `ksf-workspace/` 模板目录并自行命名。这样得到的文件夹就是用户实例。首次使用自动准备随包运行时，无需预装 Git、Node.js、npm 或 Python。当前实际发行平台是 macOS ARM64。

仓库模板：打开官方 ksf-workspace 页面，点击 **Use this template → Create a new repository**，名称默认建议 `ksf`，也可自定义，选择 **Private** 后创建，再克隆自己的用户实例仓库。公开仓库的 fork 也公开，个人资料应进入自己的私有仓库。用户实例具有独立历史，升级和贡献均不依赖这个历史。

macOS 工作区调用 `./.agents/ksf`；Windows 使用 `./.agents/ksf.ps1`。其他 cwd 使用入口绝对路径。Windows x64 已实现原生bootstrap、随包Node与共享业务CLI，平台与实机范围见[平台说明](runtime/platforms.md)。Core 开发仓库不会自动升级。入口职责与协议见[启动入口](../runtime/launcher.md)。

## 文件归属

```text
.agents/
├── ksf            macOS 固定启动与恢复入口
├── ksf.ps1        Windows 固定恢复入口
├── core/          可升级的系统定义、程序和文档
├── user-data/     KSF 系统级用户设置与状态，随用户实例保留
└── runtime-data/  本机运行时、缓存、备份和贡献草稿
```


| 位置 | 行为 |
| --- | --- |
| 清单中的 `.agents/core/` 文件、根 AGENTS.md、`.agents/ksf` 和 `.agents/ksf.ps1` | 系统管理，升级合并本地修改 |
| `.agents/core/release.json` | schema 4 小型发行凭据，仅保存精确 Core 来源、版本、平台及启动协议；禁止手工编辑 |
| `.agents/core/manifest.yaml` | 生成的运行时声明，升级使用发行版本，不作为源码贡献 |
| 根 README.md、.gitignore | 首次生成的用户文件，Core 升级不覆盖 |
| 项目、知识、能力、档案、收件箱及旧实例已有原件目录 | 个人内容，发行不读取，升级不写入；原件默认随目标保存 |
| `repositories/` | 用户工程容器，父 Git 忽略、工程各自 Git 管理；按需创建，发行不读取，升级和回滚不写入 |
| `.agents/user-data/` | 用户实例所有的系统级用户数据，Core 包不收录实际值，升级与回滚不覆盖 |
| `.agents/runtime-data/` | 本机运行时、升级备份、失败事务、检查记录和贡献草稿，不提交 |
| `.ksf-template.json` | 记录初始 ksf-workspace 模板产品、默认实例名与出处；不限定实际实例名称，当前系统版本以 release.json 为准 |

新 ksf-workspace 不携带模板自同步工作流。官方模板由 Core 发行 Actions 使用同一批已验证产物直接更新；首次同步移除官方仓库的旧定时任务，不执行旧模板程序。已有用户实例的根 `.github/` 是用户内容，普通系统升级不删除它；旧工作流的官方仓库条件仍限制其运行。

模板写入前核对观察到的远程提交及其出处：拒绝版本倒退和同版本不同 Core 提交；同版本同来源可重核模板树。写分支前重新读取 head，发生竞争则停止，最终 ref 更新始终非强制。mirror 也拒绝比本地模板更旧的发行源。

## 检查和升级

```sh
./.agents/ksf system read --json
./.agents/ksf system check --json
./.agents/ksf system update --dry-run --json
./.agents/ksf system update --json
./.agents/ksf system rollback --json
```

启动和普通 CLI 不访问远程版本源、不自动安装更新。用户通过 Agent 明确要求后，由 ksf-runtime 经 ability-route 选择 ksf-maintainer，按对应基本功执行；也可直接调用维护 CLI。查询和预览不产生安装授权。`system sync` 仅显式调用时按 `.agents/core/distribution.json` 的间隔缓存检查并更新，默认间隔一天；显式 check/update 不受此间隔限制。`KSF_SKIP_AUTO_UPDATE` 保留为无作用兼容项。开发仓库不能当发行实例安装。

默认源是 GitHub 最新正式 Release 中公开的 `ksf-core-release.json` 下载地址，直接读取索引，用户无需账户或令牌，也不消耗匿名 REST API 配额。`--source` 可临时选择 HTTPS 索引地址、Release API 或本地索引，`--from` 选择指定 Core 更新包，原版基线仍按需联网取得，均不持久改变发行源。

索引声明版本、精确 Core 提交、适用平台、包大小和 SHA256。程序验证下载、受限 USTAR+gzip 归档、路径及条目类型，并逐一核对文件清单。拒绝路径穿越、重复条目、链接、特殊文件和清单外文件。

实例发行凭据采用协议 4，更新包内部校验清单沿用协议 3；两者声明 launcher_protocol: 1，系统文件统一位于 `.agents/core/`，固定入口为 `.agents/ksf`，运行数据位于 `.agents/runtime-data/`。系统贡献目标为 main。

升级比较凭据固定的旧 Core 提交、本地文件和新官方版本。旧版文件树通过远程 Git 对象读取，原文仅在实际合并需要时取得并校验 Git blob；公开原文可按准确提交从 raw 地址读取，避免每个文件消耗一次匿名 REST 请求；不使用最新 main，不额外保存全量原版快照。未修改文件更新，本地单独修改保留，双方文本修改使用系统 diff3。文本、二进制或删除冲突时保留当前系统，结果列出路径，文本冲突附审查内容；修订本地修改后重试。个人目录和用户忽略规则不参与合并。

候选系统先验证随包运行时、变化的 JavaScript 语法、固定入口及全部系统对象的精确引用，再通过事务切换。定义检查采用候选自身的身份规范，使有效旧版入口可以回滚。事务只整体交换 `.agents/core/`；`.agents/ksf` 和 `.agents/ksf.ps1` 位于 Core 外，入口文件及 AGENTS.md 仅在内容或权限变化时原子更新，`.agents/runtime-data/` 不参与系统替换。旧版本保存在 `.agents/runtime-data/system/backups/`，不自动上传或删除。普通 I/O 失败恢复本事务实际替换的内容；若根文件有其他改动则保留文件和事务并报恢复冲突；进程中断后的下一次固定入口启动先恢复事务，再准备 Node。恢复不依赖 Git、网络或完整 Node，活跃事务通过 PID 和启动身份识别，不被其他启动器撤销。

回滚恢复上次事务。升级后又修改 Core 时返回 `ROLLBACK_LOCAL_CHANGES`，避免丢失新编辑。个人内容不受回滚影响。

运行目录自身生成忽略全部内容的 `.gitignore`，本机运行数据不进入实例的 Git 提交。

## 贡献修改

```sh
./.agents/ksf contribute prepare --paths .agents/core/runtime/src/services/hello.js --title 'fix(cli): 修复问候输出' --body-file /tmp/contribution-body.txt --pr-body-file /tmp/pr-description.md --json
./.agents/ksf contribute read <返回的贡献ID> --json
./.agents/ksf contribute submit <贡献ID> --reviewed <预览摘要> --dry-run --json
./.agents/ksf contribute submit <贡献ID> --reviewed <预览摘要> --json
```

用户在实例修改、验证系统并先形成本地 Git 提交。prepare 读取最新 HEAD 中的系统文件及同一提交保存的正式发行清单，比较完整系统快照，包含多次已提交修改的累积差异。暂存区、未暂存修改和未跟踪文件不参与，也不阻止贡献；命令不自动暂存或提交。Git 正文按[提交信息规则](git-commit-message.md)填写原因、变更和验证，独立 PR 正文按[PR 说明规则](pr-description.md)填写四项 Markdown 内容。schema 4 贡献计划冻结 sourceCommit、基线身份、选定内容、公开 diff、共同标题、两份正文、完整 commitMessage 及包含自动来源说明的完整 prBody 和 digest；真实 Core 提交与草稿 PR 分别使用审阅过的完整文本。Agent 展示后按授权提交；系统路径中的文字同样要审阅。`--all` 选择全部已提交系统差异，需先核对范围。

准备要求 KSF 根本身是 Git 根、有 HEAD 和正式基线，联网取得该提交中小型凭据固定的原版 Core；公开源可匿名读取，也可复用已有授权。read 及 submit dry-run 仅本地读取。贡献读取兼容 schema 2、3、4 及旧启动器路径，不读取未提交的发行凭据。真实 submit 在任何远程写入前核对原版 Core 提交、文件内容和权限；无法核实时保留计划。实际提交从 `KSF_GITHUB_TOKEN`、`GH_TOKEN`、`GITHUB_TOKEN` 或已有 `gh auth login` 取得授权。令牌不写入草稿、不回显，也不发往发行下载地址。

工具创建或复用正确的 ksf-core fork，在 `contrib-<ID>` 形成新提交，并向发行记录指定的 main 分支发起草稿 PR。父提交是发行原版的 Core 提交，不是个人 Git HEAD；个人历史、个人提交说明、目录和作者配置不进入新提交。Core 所有者可以直接建立自身分支。

草稿 PR 的交付提醒按 [Git 协作规则中的用户贡献要求](git.md#用户贡献)执行。

首次发布前本地 HEAD 改变须重新准备；仅工作目录或暂存区变化不使冻结计划失效。本地 sourceCommit 仅留在本机记录，不发送给 Core；PR 的父提交仍为原版 Core，不自动变基到最新 main。已记录远程提交的相同 ID 重试可核对旧计划，不混入新 HEAD。旧 schema 1／2／3 贡献计划仍可读取，只能只读核对已有 PR，不能新发布。重试重新查询远程分支、提交和 PR，缓存链接不能证明仍有效。远程变更、PR 缺失或状态未知时保留现场；合并后删除分支可核对原提交后报告 merged，已关闭未合并则报告 closed，不重复创建。普通重试不覆盖评审中已编辑的 PR 标题或正文；schema 3 的冻结提交消息仍核对。工具不自动合并 PR。不同计划若来自同一本地节点或相同系统内容，prepare 返回既往 PR 提示及只读核对结果；相同内容的 submit 返回已核实的原 PR，不重复创建。部分成功或状态未知时先恢复原 ID，不因新 prepare 而绕过保护。

## 维护和发布

系统、文档和模板源码统一在 Core 修改。模板源为 `.agents/core/distribution/template/`；发行工作流只保存在 Core 的 `.github/workflows/release.yml`，不复制进模板。

```sh
.agents/ksf runtime verify --json
.agents/ksf test --suite full
.agents/ksf release build --output .agents/runtime-data/release --json
.agents/ksf release publish .agents/runtime-data/release --dry-run --json
.agents/ksf release publish .agents/runtime-data/release --json
```

官方构建要求纯系统提交、干净源码，版本取 build.json。系统文件须与该提交的 Git blob、权限及路径集合完全一致；忽略文件混入也不能以干净 Git 状态冒充正式来源。产出定义如下；已有输出目录不覆盖，allow-dirty 仅生成不可发布的开发包，构建不扫描个人目录。

| 产物 | 定义 |
| --- | --- |
| `ksf-workspace/` | 可复制的完整用户模板目录，运行数据首次使用时生成 |
| `ksf-workspace-<版本>-<平台>.tar.gz` | 用户模板压缩包，解压内容位于实例根，不额外嵌套目录 |
| `ksf-core-<版本>-<平台>.tar.gz` | 用户实例升级使用的系统包 |
| `ksf-core-release.json` | 系统发行索引，声明产品身份、版本、Core 提交、平台及包摘要 |

索引明确记录 core=ksf-core、workspace=ksf-workspace、instance=ksf；workspace 字段表示用户模板，instance 表示建议的用户实例名，实例可以改名。构建 JSON 的 template 字段为模板目录。系统构建配置、运行声明及系统清单中的 name 均为 ksf-core，系统清单的 product 也为 ksf-core；模板来源记录中的 product 为 ksf-workspace。

正式包使用来源 Core 提交时间写构建声明，归档使用固定顺序、权限和时间。同一干净源码、平台及随包 Node 的重复构建产生相同摘要，CI 重新构建后也可恢复之前的同版本上传。普通 build 命令仍记录实际调用时间。

publish 验证包、上游提交和标签，上传全部草稿资产，更新生成模板，最后公开 Release。相同构建可重试，同版本的不同资产不能覆盖。现有同名模板仓库必须有正确生成标记，否则拒绝覆盖。

### 从用户实例发起远程发行

用户实例可由 maintainer 按 system-release 方法发起 Core Actions，无需本地 Core 克隆。实例修改须先贡献并合入 Core，正式版本号也须先进入 Core 的版本配置。发起账户须有 Core Actions 运行权限；安装 KSF 或配置模板 App 不授予此权限。不要将个人仓库 origin 当作 Core。

```sh
# 明确要求正式发布后，在任意目录执行；发的是远程 main 的版本与提交。
gh workflow run release.yml --repo yinbaiyuan/ksf-core --ref main -f operation=release
# 只恢复某个已经公开的发行版本的模板，不重建、不创建 Core Release。
gh workflow run release.yml --repo yinbaiyuan/ksf-core --ref main -f operation=template-only -f release_tag=v0.1.1
```

示例版本仅说明参数，不代表该版本已发布。也可在 Core 的 Actions 页面选择 Publish ksf-core Release → Run workflow。正常 release 不接受 release_tag；版本来自所选 Core 源码。标签推送要求 v<版本> 与源码版本一致；普通 main 合并不触发发行。请求结果未知时先查实际运行，不重复发起；并发运行不能靠“最新一条”归属。记录工作流、发起时间、操作者、事件、提交和运行 URL，按原运行恢复。

### 三阶段协议与失败恢复

1. 准备：保留 Windows 启动器检查；验证 macOS ARM64 运行时及完整回归，干净 Core 只构建一次。两个压缩包和索引同时上传，冻结 Core 提交、索引 SHA256 和 artifact ID。恢复模式从指定公开 Release 下载并核对标签提交、索引、大小和摘要，不查询 latest；仅支持包含本恢复桥接程序的 Core 发行。
2. Core：使用自身 GITHUB_TOKEN，仅此作业 contents: write。按 artifact ID 下载，在准备时固定的 Core 提交上核对索引摘要，再执行 release publish --release-only。模板返回 status=not-requested、published=false、scheduled=false，不能据此声称已同步。
3. 模板：Core 发布成功后才运行；template-only 则在准备成功后运行，即使 Core 作业被跳过。使用同一 artifact ID 执行 release template。模板程序来自 prepare 冻结的工作流提交，正常发行与 Core 来源一致，template-only 可用后续修复程序恢复原发行；发布摘要同时记录 publisher 与发行 Core 提交。此阶段只用 App 的 workspace 安装令牌。实际远程分支、提交树、来源标识和发行凭据全部匹配才返回 verified=true 与 coreRevision。

整个工作流串行排队，不取消前一运行。Core 已成功而模板失败时，两者状态分开报告；选择 Re-run failed jobs，复用成功准备阶段的产物与输出，不重跑 Core。artifact 保留 14 天，过期后按原 release_tag 发起 template-only，从原 Release 恢复。无论何种恢复都不覆盖同版本不同内容、不降低模板版本、不强制写分支。响应丢失时先核对远程；同版本同来源的相同模板树可重复验证，不新建无意义提交。

### GitHub App 配置

在维护者账户创建私有 App，仅安装到官方 ksf-workspace；关闭 webhook，不请求用户 OAuth。Repository permissions 为 Contents: read/write、Workflows: read/write，以及 GitHub 必需的 Metadata: read。Workflows 权限用于首次迁移删除旧同步任务。无需 Administration、Secrets 或 Core 仓库访问权限；官方模板必须预先存在且已标记为 Template repository，不自动建仓或修改仓库设置。

Core 配置变量 KSF_TEMPLATE_APP_CLIENT_ID 与 Secret KSF_TEMPLATE_APP_PRIVATE_KEY。私钥只存 Secret，不进入源码、发行包、贡献或运行日志；初次写入后的临时私钥删除。使用官方 actions/create-github-app-token（固定 v3.3.0 提交），owner 和 repositories 显式限定官方模板，显式请求 contents/workflows 写权限；每个作业独立签发，结束后默认撤销。

在 Core 发布前先获取受限令牌，读取 installation/repositories，确保令牌只可见目标模板，并验证远程生成标识。缺少配置、权限或模板出处时在任何 Core 发布写入前停止。模板作业重新获取并复核令牌，不能沿用可能过期的预检令牌。权限或分支规则后来变化仍可能导致部分成功，按上述恢复处理，不降低保护。

新包拒绝携带任意附加工作流。兼容旧 schema-3 包的原工作流时，必须与包内 Core 的旧模板源和官方仓库替换结果精确一致；此兼容不使新构建重新生成旧任务。release mirror 保留为显式工具，已不承担官方定时同步。

## 协议与验证边界

实例小型发行凭据协议为 4，约数百字节，不包含文件清单、原版正文或快照。原版由准确 Core 提交定位，远程读取其完整系统树，按需取得必要 blob 并验证内容身份。Core 更新包内的协议 3 清单只保存路径、权限、SHA256 和源码位置，供受限解包校验；旧协议 2／3 基线继续按兼容边界读取。更新索引仍为协议 1。下载单包上限 256 MiB，归档展开上限 512 MiB，不执行安装钩子。

本版使用 HTTPS 与摘要校验，没有独立离线签名根；发行地址及发布账户属于信任来源。持久事务覆盖普通 I/O 失败与进程中断，不声称穷尽全部硬件断电故障。

测试分别使用小型运行时、真实本机 HTTP、模拟 GitHub API及真实随包 Node/发行包。真实外部发布状态以实施记录中的证据为准，不能把模拟 API 当作已发布。

系统级用户设置的格式、读写和跨设备边界见 [user-data](cli/user-data.md)。模板只生成空目录占位；正常工作内容仍在正常用户空间。

### 大文件上传与已发行版本恢复

模板文件超过 8 MiB 时，使用本机临时、隔离配置的 Git 对象库及非强制 push，不把大型二进制转为 REST blob JSON。Git pack 复用远程已有对象；完整生成树仍会移除旧模板任务。上传前固定目标仓库、分支、父提交和版本。临时发布仓库的 pre-push 检查服务端通告的旧提交必须等于预期父提交，再由 Git 服务端原子比较该旧提交；并发新增、回退或删除均停止，不重新创建已删除分支。此检查不是用户实例或全局 Git hook。上传后对账实际提交树、来源标识与发行凭据。凭证只通过受限子进程环境提供，不写 URL、文件、仓库或日志。Git 不可用时在 Core 发布前的预检失败。普通 KSF 运行不新增 Git 依赖。

若旧发行的模板发布程序有缺陷，单纯重跑旧作业仍会使用旧程序。合入修复后，从含修复的 main 发起 `template-only` 并指定原标签（例如 `v0.1.1`）。prepare 冻结维护程序提交，下载并校验原版三个资产；template 使用固定维护程序处理原产物。原标签、Core 提交、压缩包、索引及摘要保持原样，不以重新发布同版本修复程序。正常发行的程序来源仍与当次 Core 源码一致。

新工作区从已验证 Core 模板源生成根 `USER.md`、`BOT.md`、`知识/knowledge.md`、`知识/rules/` 公共约定、可选认知定义与空模板骨架、`档案/archive.md` 和个人、企业、项目空档案分区，不再生成根级归档或源档。旧模板按包内源文件识别旧布局，已知空占位可兼容；未知额外文件和非空占位继续拒绝。两份根协作文件与知识、档案根说明均归用户实例；真实根协作文件不进入 Core 发行或公开贡献。升级和回滚不覆盖其定制、不补写缺失文件，也不自动改名或移动旧资料。包内没有新增协作或知识规则模板源的旧包仍可校验；存在对应模板源时，生成文件必须逐字节匹配，空目录占位必须为空且为 0644。模板文件按显式白名单生成并校验，不读取实例知识正文。Core 包只携带模板源；升级不将它们自动复制到用户知识目录。

## 持久数据兼容

更新与回退同时核对目标Core的data-compatibility.json和已安装应用的宿主要求；不兼容、缺声明或读失败保留原件并拒绝切换。本轮不主动改变Core业务数据格式。详见[Core数据兼容](runtime/data-compatibility.md)。
