# release 命令

已实现 ksf-core 系统发行、ksf-workspace 用户模板构建/发布和镜像。用户从模板创建名为 ksf 或自定义名称的实例。整体协议与用户流程见[发行说明](../distribution.md)，公共参数和结果继承 [CLI 规范](../CLI命令设计规范.md)。

| 调用 | 作用 |
| --- | --- |
| `release build [--output <目录>] [--platform <平台>] [--allow-dirty] [--dry-run]` | 生成 ksf-workspace 模板、ksf-core 系统更新包和版本索引 |
| `release publish <发行目录> [--release-only] [--dry-run]` | 发布已验证的包，默认同时更新模板 |
| `release template <发行目录> [--dry-run]` | 单独发布模板 |
| `release mirror [--source <地址>] [--dry-run]` | 显式镜像正式 Release（兼容工具） |

各操作支持 json，命令及操作支持单独 help。选项不能重复，多余参数报错。路径按 KSF 根解析；output 默认 `.agents/runtime-data/releases/<版本>-<平台>`，platform 默认当前平台。版本来自 build.json，不自动递增。

输出包含 `ksf-workspace/`、`ksf-workspace-<版本>-<平台>.tar.gz`、`ksf-core-<版本>-<平台>.tar.gz` 和 `ksf-core-release.json`。用户将模板复制或解压为 `ksf/` 或自定义目录后使用，发行程序不读取已有实例。模板与实例内的 release.json 为 schema 4 小型发行凭据，仅记录版本、平台和准确 Core 来源；Core 更新包内部仍用 schema 3 文件清单验证解包，不内嵌原版正文，不额外生成原版压缩快照。publish 同时核对模板凭据与更新包清单的身份一致。

build 要求已有 Git 提交和实际提供的运行时资产；用户的普通使用和升级不要求 Git；贡献准备需要用户实例已有本地 Git 提交。脏源码需要显式 allow-dirty，产物不能作为官方发行。输入链接、已有输出目录和可信校验不符均拒绝。只读取系统清单，不扫描个人目录。正式包还逐项核对工作文件与该 Core 提交的 Git blob、权限和系统路径集合；被 Git 忽略但混入系统目录的文件也会阻止正式构建，allow-dirty 下只能成为 development 包。

publish/template 需要 GitHub 授权；预览检查内容，不认证、不写远程。release-only 只发布 Core，返回 template.status=not-requested、published=false、scheduled=false，不承诺已安排模板同步。官方 Actions 的独立模板作业复用同一 artifact ID；新模板不再携带定时自同步任务。mirror 无新版本时不下载大包；预览可能下载验证包，但不发布。

JSON：`{ok, command:"release", operation, data, errors}`，业务结果和错误都在 stdout。成功 0，操作失败 1，参数错误 2。build 返回 products 三层身份及 template 模板路径。模板实际发布后还对账远程分支、提交树、来源标识和发行凭据，返回 verified=true、coreRevision 及实际模板 commit；发布结果明确模板 product=ksf-workspace、instanceDefaultName=ksf，另外提供版本、来源提交、包摘要或发布 URL，不输出令牌。

典型错误：RELEASE_SOURCE_DIRTY、PLATFORM_UNSUPPORTED、OUTPUT_EXISTS、RELEASE_INVALID、RELEASE_INPUT_CHANGED、TEMPLATE_NOT_GENERATED、RELEASE_TAG_CONFLICT、RELEASE_ASSET_CONFLICT、GITHUB_AUTH_REQUIRED。

构建预览只使用临时目录；实际构建写指定输出目录。发布是外部写操作，应先核对预览和内容。未知结果时重试同一个发行目录，不重建不同内容覆盖同版本。实现位于 distribution/release.js、archive.js、publish.js、github.js；验证见 distribution.test.js、release-publish.test.js、release-network.test.js。

模板发布新增版本及并发保护：TEMPLATE_VERSION_OLDER 拒绝旧版覆盖远程新版，TEMPLATE_VERSION_CONFLICT 拒绝同版本不同 Core 来源，TEMPLATE_CHANGED 表示准备期间远程分支已变。mirror 对比本地模板后可返回 skipped=older-release；同版本换源返回 RELEASE_REPLACED。预览只验证本地产物，不认证或保证远程版本条件；实际写入必须重新核对远程出处与 head。

从用户实例发起远程发布与 template-only 恢复属于 Core Actions 接口，不新增 CLI 操作。具体输入、App 配置和失败重试见[发行说明](../distribution.md#从用户实例发起远程发行)。TEMPLATE_VERIFY_FAILED 表示实际远程模板与已验证包不一致，不能报告成功；保留原包和远程状态再核对。
