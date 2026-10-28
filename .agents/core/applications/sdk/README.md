# KSF 应用 SDK 3.0.0 开发版

宿主协议为 SDK v3，兼容已有 v1/v2 安装包；尚未正式发行。完整开发规范与AI开发入口统一在[应用开发者手册](../../docs/app-development/README.md)，请先读[AI-START](../../docs/app-development/AI-START.md)。

本目录提供公共类型、React适配、文件/AI客户端、JSON持久化、四个模板及ksf-app create/check/build。普通应用的模型执行统一经过宿主AI服务；应用不保存模型密钥或自行启动模型CLI。

```sh
npm ci --ignore-scripts
node scripts/ksf-app.mjs create ../my-app --template window
```

新应用只依赖手册列出的公共入口，不能依赖Core私有源码。server/protocol.js是应用协议维护源，scripts/sync-protocol.mjs生成独立运行时副本，--check用于CI。运行时不从SDK源码动态读取后端；发布产物包含完整依赖。

本SDK仍面向已确认的受信任代码。能力声明不是沙箱，支持及验收范围见开发手册。

`protocol:check` 与 `scripts/sync-protocol.mjs` 仅供 Core 维护者生成/核对运行时副本；独立开发包不包含该副本，应用开发只需 create/check/build 与模板验收，不执行该维护脚本。

商店图标、截图和更新说明见[展示资料规范](../../docs/app-development/store-listing.md)。可使用 `ksf-app build . --listing-only --store ../store` 独立更新已构建版本的介绍，无需重打包。

新增接口见[应用包内 CLI](../../docs/app-development/cli.md)与[通信、后台和工作流](../../docs/app-development/communication.md)。新建 --template collaboration 可获得包内 CLI 与消息激活的独立工作流示例；任务、等待和审批状态均由应用保存。
