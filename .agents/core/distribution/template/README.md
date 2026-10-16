# ksf-workspace 用户模板

这是由 `ksf-core` 系统生成的 KSF 用户模板。复制或解压模板后，将目录命名为 `ksf` 或自己选择的名称，即可作为个人 KSF 用户实例使用。从模板创建私有仓库时，也可以使用 `ksf` 或自定义仓库名。

`ksf-core` 承接系统，`ksf-workspace` 承接模板，用户实例保存自己的正式内容。使用已有支持的平台模板包，无需预装 Node.js、Python、npm 或 Git。目录或仓库改名不影响系统运行、升级或贡献。

收到模板文件夹后，按自己的名称保存为用户实例，用 Agent 打开该目录，让它读取根目录的 AGENTS.md 即可。终端入口是 `./.agents/bin/ksf`，可运行 `./.agents/bin/ksf --help` 检查。

- 项目、知识、能力、源档、归档和收件箱保存你的正式个人内容。
- `.agents/core/` 是随包 Core；系统会按配置的 Release 地址检查和升级。
- `.agents/bin/ksf` 是固定启动与恢复入口。
- `.agents/runtime-data/` 保存本机缓存、升级备份、日志及贡献草稿。

你可以直接使用文件夹；希望远程备份时，也可以从官方模板创建自己的私有仓库。公开仓库的 fork 也会公开，存放个人资料时请选择自己的私有仓库。

系统操作：

```sh
./.agents/bin/ksf system read --json
./.agents/bin/ksf system check --json
./.agents/bin/ksf system update --dry-run --json
./.agents/bin/ksf system update --json
./.agents/bin/ksf system rollback --json
```

升级保留个人目录、`.gitignore` 和用户修改；无法自动合并的系统修改会报告冲突，保留原系统。无网络时仍可使用已有版本。

想贡献系统修改时，告诉 Agent 具体要贡献什么。它先通过 `contribute prepare` 整理选定差异，展示将公开的内容，再通过 `contribute submit` 向 Core 发起 PR。贡献不携带你的个人 Git 历史；首次提交需要 GitHub 授权。

完整说明在 `.agents/core/docs/distribution.md`。
