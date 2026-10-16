# 发行、升级与贡献

KSF 分为系统、用户模板和用户实例三层：

| 名称 | 承接内容 | 发行与使用方式 |
| --- | --- | --- |
| `ksf-core` | KSF 系统：运行程序、系统能力、协议、文档、测试和模板源 | 唯一系统开发源，发布系统更新包 |
| `ksf-workspace` | KSF 用户模板：随包系统、空的用户目录、初始说明和忽略规则 | 从 ksf-core 构建，发布模板目录、模板压缩包及官方模板仓库 |
| `ksf` 或用户自定义名称 | 真正的 KSF 用户实例，保存该用户的项目、知识、能力及配置 | 复制/解压模板或从模板创建私有仓库后使用；实例名称不进入系统版本身份 |

三种身份的程序定义统一位于 [products.js](../runtime/src/distribution/products.js)。命令入口仍为 `.agents/bin/ksf`，不随用户实例目录或仓库名称变化。

Core 源码不保留用户根目录或占位文件；ksf-workspace 模板的项目、知识、能力、收件箱、源档和归档目录由发行程序生成。Core 源码中的能力发现允许用户目录不存在；模板和用户实例仍检查用户能力目录的完整性。

## 开始使用

文件夹分发：将 `ksf-workspace-<版本>-<平台>.tar.gz` 解压到名为 `ksf` 或用户自定义名称的空目录，用 Agent 打开并读取根 AGENTS.md；也可复制构建生成的 `ksf-workspace/` 模板目录并自行命名。这样得到的文件夹就是用户实例。首次使用自动准备随包运行时，无需预装 Git、Node.js、npm 或 Python。当前实际发行平台是 macOS ARM64。

仓库模板：打开官方 ksf-workspace 页面，点击 **Use this template → Create a new repository**，名称默认建议 `ksf`，也可自定义，选择 **Private** 后创建，再克隆自己的用户实例仓库。公开仓库的 fork 也公开，个人资料应进入自己的私有仓库。用户实例具有独立历史，升级和贡献均不依赖这个历史。

所有工作区统一调用 `./.agents/bin/ksf`，其他 cwd 使用绝对路径。Core 开发仓库不会自动升级。

## 文件归属

```text
.agents/
├── bin/ksf        固定启动与恢复入口
├── core/          可升级的系统定义、程序和文档
└── runtime-data/  本机运行时、缓存、备份和贡献草稿
```


| 位置 | 行为 |
| --- | --- |
| 清单中的 `.agents/core/` 文件、根 AGENTS.md 和 `.agents/bin/ksf` | 系统管理，升级合并本地修改 |
| `.agents/core/release.json` | 生成的精确来源、版本、平台、文件清单和原版基线，禁止手工编辑 |
| `.agents/core/manifest.yaml` | 生成的运行时声明，升级使用发行版本，不作为源码贡献 |
| 根 README.md、.gitignore | 首次生成的用户文件，Core 升级不覆盖 |
| 项目、知识、能力、源档、归档、收件箱 | 个人内容，发行不读取，升级不写入 |
| `.agents/runtime-data/` | 本机运行时、升级备份、失败事务、检查记录和贡献草稿，不提交 |
| `.ksf-template.json` | 记录初始 ksf-workspace 模板产品、默认实例名与出处；不限定实际实例名称，当前系统版本以 release.json 为准 |

ksf-workspace 模板带 `.github/workflows/sync-template.yml`，任务只允许在官方模板仓库运行，用户复制或从模板创建的实例仓库不会执行该发布任务。

## 检查和升级

```sh
./.agents/bin/ksf system read --json
./.agents/bin/ksf system check --json
./.agents/bin/ksf system update --dry-run --json
./.agents/bin/ksf system update --json
./.agents/bin/ksf system rollback --json
```

发行源及间隔在 `.agents/core/distribution.json`。正常业务 CLI 启动前按间隔执行 `system sync`，默认每天检查一次。失败也记录尝试，离线不阻断已有版本的业务。帮助、测试、构建、发行、贡献和 system 不嵌套触发检查。新会话没有 CLI 业务时，入口搭档执行一次 sync。`KSF_SKIP_AUTO_UPDATE=1` 临时禁用自动检查，显式操作仍可用。开发包不自动更新。

默认源是 GitHub 最新正式 Release 中公开的 `ksf-core-release.json` 下载地址，直接读取索引，用户无需账户或令牌，也不消耗匿名 REST API 配额。`--source` 可临时选择 HTTPS 索引地址、Release API 或本地索引，`--from` 安装离线 Core 更新包，均不持久改变发行源。

索引声明版本、精确 Core 提交、适用平台、包大小和 SHA256。程序验证下载、受限 USTAR+gzip 归档、路径及条目类型，并逐一核对文件清单。拒绝路径穿越、重复条目、链接、特殊文件和清单外文件。

安装清单采用协议 2，系统文件统一位于 `.agents/core/`，固定入口为 `.agents/bin/ksf`，运行数据位于 `.agents/runtime-data/`。系统贡献目标为 main。

升级比较旧官方版本、本地文件、新官方版本。未修改文件更新，本地单独修改保留，双方文本修改使用系统 diff3。文本、二进制或删除冲突时保留当前系统，结果列出路径，文本冲突附审查内容；修订本地修改后重试。个人目录和用户忽略规则不参与合并。

候选系统先验证随包运行时及变化的 JavaScript 语法，再通过事务切换。事务只整体交换 `.agents/core/`；`.agents/bin/` 保持可用，入口文件及 AGENTS.md 分别原子更新，`.agents/runtime-data/` 不参与系统替换。旧版本保存在 `.agents/runtime-data/system/backups/`，不自动上传或删除。普通 I/O 失败恢复原系统；进程中断后的下一次固定入口启动先恢复事务，再准备 Node。恢复不依赖 Git、网络或完整 Node，活跃事务通过 PID 和启动身份识别，不被其他启动器撤销。

回滚恢复上次事务。升级后又修改 Core 时返回 `ROLLBACK_LOCAL_CHANGES`，避免丢失新编辑。个人内容不受回滚影响。

运行目录自身生成忽略全部内容的 `.gitignore`，本机运行数据不进入实例的 Git 提交。

## 贡献修改

```sh
./.agents/bin/ksf contribute prepare --paths .agents/core/runtime/src/services/hello.js --title '修复问候输出' --json
./.agents/bin/ksf contribute read <返回的贡献ID> --json
./.agents/bin/ksf contribute submit <贡献ID> --reviewed <预览摘要> --dry-run --json
./.agents/bin/ksf contribute submit <贡献ID> --reviewed <预览摘要> --json
```

用户在实际工作区修改、验证 Core，工具只提取选定系统差异。prepare 冻结内容并生成公开 diff、标题、说明和摘要。Agent 展示这些内容后再提交；路径属于系统不代表具体文字必然适合公开。`--all` 选择全部系统改动，需先核对范围。

准备与预览不要求 Git 或账户。实际提交从 `KSF_GITHUB_TOKEN`、`GH_TOKEN`、`GITHUB_TOKEN` 或已有 `gh auth login` 取得授权。令牌不写入草稿、不回显，也不发往发行下载地址。

工具创建或复用正确的 ksf-core fork，在 `contrib-<ID>` 形成新提交，并向发行记录指定的 main 分支发起草稿 PR。父提交是发行原版的 Core 提交，不是个人 Git HEAD；个人历史、提交说明、目录和作者配置不进入新提交。Core 所有者可以直接建立自身分支。

审查后文件或安装版本改变时要求重新准备。相同 ID 重试恢复已有分支和 PR，远程分支被其他修改时拒绝覆盖。工具不自动合并 PR。

## 维护和发布

系统、文档和模板源码统一在 Core 修改。模板源为 `.agents/core/distribution/template/`，官方工作流源为 `.agents/core/distribution/template-workflow.yml`。

```sh
.agents/bin/ksf runtime verify --json
.agents/bin/ksf test
.agents/bin/ksf release build --output .agents/runtime-data/release --json
.agents/bin/ksf release publish .agents/runtime-data/release --dry-run --json
.agents/bin/ksf release publish .agents/runtime-data/release --json
```

官方构建要求纯系统提交、干净源码，版本取 build.json。产出定义如下；已有输出目录不覆盖，allow-dirty 仅生成不可发布的开发包，构建不扫描个人目录。

| 产物 | 定义 |
| --- | --- |
| `ksf-workspace/` | 可复制的完整用户模板目录，运行数据首次使用时生成 |
| `ksf-workspace-<版本>-<平台>.tar.gz` | 用户模板压缩包，解压内容位于实例根，不额外嵌套目录 |
| `ksf-core-<版本>-<平台>.tar.gz` | 用户实例升级使用的系统包 |
| `ksf-core-release.json` | 系统发行索引，声明产品身份、版本、Core 提交、平台及包摘要 |

索引明确记录 core=ksf-core、workspace=ksf-workspace、instance=ksf；workspace 字段表示用户模板，instance 表示建议的用户实例名，实例可以改名。构建 JSON 的 template 字段为模板目录。系统构建配置、运行声明及系统清单中的 name 均为 ksf-core，系统清单的 product 也为 ksf-core；模板来源记录中的 product 为 ksf-workspace。

正式包使用来源 Core 提交时间写构建声明，归档使用固定顺序、权限和时间。同一干净源码、平台及随包 Node 的重复构建产生相同摘要，CI 重新构建后也可恢复之前的同版本上传。普通 build 命令仍记录实际调用时间。

publish 验证包、上游提交和标签，上传全部草稿资产，更新生成模板，最后公开 Release。相同构建可重试，同版本的不同资产不能覆盖。现有同名模板仓库必须有正确生成标记，否则拒绝覆盖。

自动发布不需要跨仓库令牌：ksf-core 标签工作流用自身 GITHUB_TOKEN 执行 `release publish --release-only`，ksf-workspace 工作流每 15 分钟用自己的令牌执行 `release mirror`，也可手动运行。GitHub 调度可能延迟。首次创建官方 ksf-workspace 并设置 Template repository 是维护者的一次性操作。无新版本时镜像只检查索引，不重复下载大包。

## 协议与验证边界

安装清单协议版本 2，更新索引仍为协议 1。每个文件记录路径、权限、SHA256 和 Core 源码位置；不超过 2 MiB 的 UTF-8 文本附原版内容，二进制只保存摘要。下载单包上限 256 MiB，归档展开上限 512 MiB，不执行安装钩子。

本版使用 HTTPS 与摘要校验，没有独立离线签名根；发行地址及发布账户属于信任来源。持久事务覆盖普通 I/O 失败与进程中断，不声称穷尽全部硬件断电故障。

测试分别使用小型运行时、真实本机 HTTP、模拟 GitHub API及真实随包 Node/发行包。真实外部发布状态以实施记录中的证据为准，不能把模拟 API 当作已发布。
