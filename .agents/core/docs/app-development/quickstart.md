# 从空目录开发

## 环境和目录

使用 Node.js 24 LTS 和 npm。开发包目录为 `sdk/`、`docs/`；应用放在相邻 `apps/`。无需 Core 私有源码。SDK 使用源码打包，安装到工作台的 .ksfapp 已包含运行依赖。

```sh
cd sdk
npm ci --ignore-scripts
node scripts/ksf-app.mjs create ../apps/my-work --template window
cd ../apps/my-work
npm install --ignore-scripts
npm run typecheck
npm run check
npm run build
```

模板名为 `window`、`cards`、`ai-task`、`collaboration`、`service`。service为纯后台模板，无前端工具链；按需/常驻要求见[生命周期](lifecycle.md)。create 拒绝覆盖既有目录。模板的.npmrc启用install-links，将SDK装入应用node_modules；不依赖相邻Core或SDK目录中的React。首次安装应用依赖后保留生成的 package-lock.json；此后和 CI 使用 `npm ci --ignore-scripts`。SDK 自身也带锁文件。

生成的应用通过 `file:` 引用开发包 SDK，不引用 Core。移动目录时维护相对依赖路径，再更新锁。`node build.mjs` 和 `ksf-app build .` 均可构建；CLI 的 check/build 可附 `--json`。退出码 0 成功，1 检查发现错误，2 参数或执行错误。JSON 包含 ok、diagnostics 或 error。

## 模板能力

- window：React 主窗口、后端计数及原子持久化，多窗口共用数据。
- cards：无主窗口、摘要/明细两类型，同类多实例配置独立，后端共享。
- ai-task：手动选择 profile、文本/材料输入、幂等提交、恢复任务、取消及成功结果读取。默认不发起模型请求，不启用定时。该示例保留一条业务运行，重复点击恢复同一条，不暗中产生新付费任务。

- collaboration：SDK v1 包内 CLI、任务传递、持久反馈等待、消息激活和人工审批。配对并授权通道后可跨节点运行；任务不会自动执行本机 AI 或工具。

## 本地安装

### 分享应用包并手动安装

构建后可以直接将 `.ksfapp` 文件分享给另一位用户。接收方在应用商店顶部选择“导入应用包”，选择文件后核对应用 ID、版本、开发者声明、文件名与能力，勾选信任后安装。预览阶段不执行应用代码；确认后沿用正常窗口、卡片、后台及版本切换机制。

手动导入无需配置应用源，安装记录标为“手动导入”。后续更新再次导入更高版本的包；相同包提示已安装，不能导入旧版本或同版本不同内容。已有在线源安装的同 ID 应用保持原来源，改用手动导入须先卸载并核对业务数据兼容。官方保留 ID 不能手动导入。

单个包最多 32 MiB；仍执行包格式、文件完整性、平台、SDK 与 Node ABI 校验。预览保留 15 分钟，关闭确认框即释放，宿主重启后需重新选择文件。当前包不包含单独发布的商店截图与展示图片，手动安装使用 Manifest 显示信息和内置图标。开发者声明与 SHA256 不等于发布者签名。

### 通过应用源安装

默认输出相邻 `store/` 的包和 index.json。也可执行：

```sh
npx --no-install ksf-app build . --store ./distribution --json
python3 -m http.server 8048 --bind 127.0.0.1 --directory ./distribution
```

在工作台应用商店添加 `http://127.0.0.1:8048/index.json`，核对来源与能力后安装。前端 ESM/CSS 和后端均动态载入，应用更新不要求重启主服务。

示例 ID 必须在正式开发时改为自有稳定三段式 ID，例如 `com.yourname.review-notes`，首段固定 `com`，同时更新名称和说明。官方 `com.ksf.conversations`、`com.ksf.markdown`、`com.ksf.git`、`com.ksf.documentation`、`com.ksf.activity-monitor` ID 只允许来自随包源。`com.ksf.app-store` 为宿主内部保留身份。

AI 模板没有 profile 时，在工作台系统设置的 AI 任务服务中配置连接与执行配置；应用不负责写管理配置。真实 API/CLI 的认证与兼容要求见实例操作说明，不因示例能安装就认定已具备模型能力。

本轮新契约以[SDK v1 生命周期](lifecycle.md)为准：清单 schemaVersion/sdkVersion 均为 1，后端必须声明 lifecycle；无旧协议兼容。后台管理见[运行服务](../runtime/service.md)。
