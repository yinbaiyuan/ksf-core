# ksf-workspace 用户模板

这是由 `ksf-core` 系统生成的 KSF 用户模板。复制或解压模板后，将目录命名为 `ksf` 或自己选择的名称，即可作为个人 KSF 用户实例使用。从模板创建私有仓库时，也可以使用 `ksf` 或自定义仓库名。

`ksf-core` 承接系统，`ksf-workspace` 承接模板，用户实例保存自己的正式内容。使用已有支持的平台模板包，无需预装 Node.js、Python、npm 或 Git。目录或仓库改名不影响系统运行、升级或贡献。

收到模板文件夹后，按自己的名称保存为用户实例，用 Agent 打开该目录，让它读取根目录的 AGENTS.md 即可。终端入口是 `./.agents/ksf`，可运行 `./.agents/ksf --help` 检查。

- 项目、知识、能力、源档、归档和收件箱保存你的正式个人内容。
- `.agents/core/` 是随包 Core；启动不会检查或安装新版。需要时明确要求 Agent 检查、预览或升级，也可手动运行 system 命令。
- `.agents/ksf` 是 macOS 固定入口；`.agents/ksf.ps1` 是 Windows PowerShell 入口。Windows 当前可独立恢复事务，实际业务运行仍待 Windows bootstrap 和运行时包接入。
- `.agents/user-data/` 保存 KSF 程序自身的用户设置与必要状态，可随你的实例备份迁移；正常工作内容仍在正常用户空间。
- `.agents/runtime-data/` 保存本机缓存、升级备份、日志及贡献草稿。

你可以直接使用文件夹；希望远程备份时，也可以从官方模板创建自己的私有仓库。公开仓库的 fork 也会公开，存放个人资料时请选择自己的私有仓库。

系统操作：

```sh
./.agents/ksf system read --json
./.agents/ksf system check --json
./.agents/ksf system update --dry-run --json
./.agents/ksf system update --json
./.agents/ksf system rollback --json
```

升级保留个人目录、`.gitignore` 和用户修改；无法自动合并的系统修改会报告冲突，保留原系统。无网络时仍可使用已有版本。

想贡献系统修改时，告诉 Agent 具体要贡献什么。它先通过 `contribute prepare` 整理选定差异，展示将公开的内容，再通过 `contribute submit` 向 Core 发起 PR。贡献不携带你的个人 Git 历史；首次提交需要 GitHub 授权。

维护者可从[系统基础架构](.agents/core/docs/system/README.md)了解启动、CLI、数据目录和生命周期；完整发行说明在 `.agents/core/docs/distribution.md`。

入口与跨平台支持范围见 `.agents/core/runtime/launcher.md`。Windows 可运行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .agents/ksf.ps1 launcher recover`；该调用只为本次进程指定策略，不修改全局设置。

系统级用户数据使用 `ksf user-data` 管理，说明见 `.agents/core/docs/cli/user-data.md`。首版为空，未配置时使用系统默认值；Core 升级不覆盖用户值。
