# 本地 Web 服务

本地工作台以任务路由为中心，采用 React、TypeScript、Vite、Tailwind 与按需引入的 shadcn/ui、Lucide。Node HTTP 服务继续使用随包运行时；发行实例读取预构建资源，启动无需 npm、安装依赖或网络。首页按 [task](task.md) 的历史主归属组织项目／知识／能力／档案、聊天与轮次，`/?view=routes` 查询 [route](route.md) 的当前快照与变化历史，不编辑项目、任务、知识或能力。

## 启动与停止

从当前 KSF 根执行：

```sh
.agents/ksf web
.agents/ksf web --port 8080
.agents/ksf web --port 0 --json
.agents/ksf web --help
```

其他工作目录使用该 KSF 的 `.agents/ksf` 绝对路径。入口照常恢复中断事务并准备随包 Node，不依赖全局 Node。当前平台范围沿用[运行时支持](overview.md)。

命令在前台持续运行；监听成功后输出访问地址。终端按 `Ctrl+C` 或向进程发送 `SIGTERM`，服务关闭连接、释放端口并退出 0。未结束连接最多等待约 2 秒后强制关闭。服务不会自动转入后台、打开浏览器、配置开机启动或创建 PID 文件。

## 参数与输出

| 选项 | 含义与默认行为 |
| --- | --- |
| `--port <数字>` | 可选，默认 4173；0 表示由系统选择空闲端口，其他值为 1–65535；不可重复 |
| `--json` | 可选，监听成功后在 stdout 输出一个就绪结果；不可重复 |
| `--help` / `-h` | 单独使用时输出帮助并退出；不可与其他参数混用 |

固定监听 `127.0.0.1`，不提供外网监听选项。不接受位置参数、未知选项或无效端口。指定端口被占用时明确失败，不静默选择其他端口。

文本输出示例：

```text
KSF Web: http://127.0.0.1:4173/
Press Ctrl+C to stop.
```

JSON 就绪结果使用统一命令信封，`command` 为 `web`、`operation` 为 null；`data` 包含 `host`、实际 `port`、`url`、`startedAt` 和 `nodeVersion`，`errors` 为空。它表示已监听成功，进程仍在运行。启动失败时 stdout 输出错误结果；成功就绪后的运行错误写入 stderr，避免在 stdout 追加第二个 JSON 值。

## HTTP 接口与边界

| 路径 | 方法 | 响应 |
| --- | --- | --- |
| `/`、`/index.html` | GET / HEAD | 归属聊天树、完整轮次栏、本轮能力与对话详情 |
| `/assets/<构建文件>` | GET / HEAD | 构建清单白名单中的脚本、分块、样式；校验后提供 |
| `/api/task-targets` | GET / HEAD | 历史主归属目录、聊天／轮次数、最近主归属上报及读取缺口 |
| `/api/task-projects` | GET / HEAD | 历史项目、主项目/仅引用轮次数、相关聊天数及读取缺口 |
| `/api/tasks?limit=50&offset=0&q=关键词&project=项目键` | GET / HEAD | 服务端搜索/项目过滤后分页，含项目选项、采集配置与诊断 |
| `/api/tasks/<taskId>?limit=20&offset=0` | GET / HEAD | 任务与轮次摘要分页，正文不在摘要内 |
| `/api/tasks/<taskId>/turns/<turnId>` | GET / HEAD | 单轮原文、修订与全部路由；`?messages=0` 只取路由和轮次信息，省略正文；无记录 404，损坏 500 |
| `/api/health` | GET / HEAD | JSON：`ok`、`service: "ksf-web"`、`nodeVersion`、`startedAt` |
| `/api/routes?limit=50&offset=0` | GET / HEAD | route list 信封；limit 1–100、offset 非负，默认 50/0 |
| `/api/routes/<sessionKey>` | GET / HEAD | route read 信封；无记录为 404，读取失败为 500 |

HEAD 返回相同状态与响应头，不返回正文。响应不缓存。未知路径返回 404，其他方法返回 405 和 `Allow: GET, HEAD`；错误正文含 `ok: false` 与 `error.code/message`。只接受实际端口的 `127.0.0.1` 或 `localhost` Host；提供 Origin 时也必须匹配本服务的本地地址，不开启跨域读取。

静态页面通过明确路径映射提供，不把 KSF 根、`.agents` 或用户内容作为静态目录。路由查询只读取本机路由记录、routing 开关和用于核对的项目/能力入口，不返回入口正文、不改写记录或用户资产。列表局部损坏时 HTTP 200，ok 为 false，data 保留可读记录及逐项 errors；非法分页为 400。路由 API 沿用 `{ok,command,operation,data,errors}`，通用 HTTP 拒绝仍使用 error 信封。健康接口不返回本机绝对路径。

CSP 只允许同源脚本、样式和 fetch，不允许内联代码、外部资源或嵌入。普通记录由 React 转义，Markdown 经清洗且禁用原始 HTML，只允许显式 http/https 链接，不自动加载远程图片或附件。页面可见时每 3 秒查询，隐藏后暂停，保留任务、轮次、滚动、展开与抽屉状态；显示最近上报时间与 Agent 声明状态，不宣称宿主仍在运行。固定入口不展示（原始记录保留），能力阶段、来源变化和历史截断均可查看。

## 错误与文件影响

| 错误码 | 含义 |
| --- | --- |
| `INVALID_ARGUMENTS` | 参数错误，退出 2 |
| `WEB_ADDRESS_IN_USE` | 指定端口已被占用，退出 1 |
| `WEB_START_FAILED` | 本地监听或启动失败，退出 1 |
| `WEB_SERVER_FAILED` | 就绪后的服务错误，关闭服务并退出 1 |
| `WEB_HOST_NOT_ALLOWED` / `WEB_ORIGIN_NOT_ALLOWED` | 请求地址或来源不匹配，HTTP 403 |
| `WEB_REQUEST_INVALID` | 请求 URL 无效，HTTP 400 |
| `WEB_METHOD_NOT_ALLOWED` / `WEB_NOT_FOUND` | HTTP 方法或路径不支持，405 / 404 |

HTTP 请求只读。采集已启用时，服务启动及每 3 秒补采宿主记录，写入已允许轮次的档案和本地游标；关闭服务后 Hooks/CLI 仍独立工作。共同启动可能准备 `.agents/runtime-data/runtime/`。

## 实现与验证

- [web 命令适配](../../runtime/src/commands/web.js)：参数、启动结果、错误和退出信号。
- [web 服务](../../runtime/src/services/web.js)：本地监听、明确路由与关闭连接。
- [前端开发说明](../../runtime/web/README.md)：源码、组件、构建、锁文件与许可。
- [route 服务](../../runtime/src/services/routes.js)：CLI 与 Web 共用的记录和查询规则。
- [Web 测试](../../runtime/tests/web.test.js)：真实 HTTP、路径隔离、来源检查、端口冲突、参数与真实启动器的启停。

返回 [CLI 索引](index.md)。

## 工作台行为与前端构建

项目视角默认选中最近涉及所选项目的轮次，独立 projectContext 保存最近相关上报和默认轮次。聊天摘要 latestReported 与最新原生轮次 lastTurn 分开，现有 route、lastRouteAt 继续只代表最新轮次，语义不变。新轮次未上报时单独提示；新上报提供跳转按钮，历史选择不随轮询改变。

q 最多 200 字符，project 最多 256 字符。未指定 projectMatch 时保留最近上报项目及任务简述的查询语义；projectMatch=history 按全部轮次主项目匹配，搜索同时覆盖历史路由简述、项目与专业能力。过滤后计算 total/nextOffset，unfilteredTotal 为完整可读聊天数。重复过滤参数或非法 messages 返回 400。

开发时在 runtime/web 执行 `npm ci`、`npm run build`，使用随包 Node；依赖版本精确锁定。发布携带源码、锁文件、dist 资源及第三方许可。Core 构建和 Web 启动验证源码/锁文件摘要与资源 SHA256，缺失或过期返回 `WEB_BUILD_INVALID`，不自动联网安装。Vite 清单生成显式资源白名单；源码、node_modules、构建元数据、映射文件及工作区原件均不提供 HTTP 静态访问。

布局和默认定位按下方项目优先工作台约定执行。聊天和轮次摘要不包含正文；只请求所选轮次的正文，阅读组件随主界面加载，以便旧链接在首次加载时可靠定位对话。旧版路由页继续使用关系总览。

## 归属优先工作台

首页按归属 → 聊天 → 轮次 → 本轮详情组织。归属分“项目”“知识”“能力”“档案”四组，分组只是标题，不增加导航层。仅列出历史主归属，关联对象留在详情，不收录聊天；虚拟状态入口按实际记录显示。聊天按需加载，轮次保留完整上下文，标明本项目、本知识单元、仅关联、其他归属及缺失状态。同轮切换保留真实顺序。首次进入默认最近以当前对象为主归属的轮次，手动选择及刷新保持。

详情维持“请求 → 路由 → 结果”，路由默认展开语义演进时间线，主归属及关联项目、关联知识分开。只讨论的知识目标不代表知识已写入，来源失效提示不伪造历史变化。固定入口隐藏。1100px 起显示 280px 归属聊天树、220px 轮次栏和正文；768–1099px 归属树进抽屉、保留 200px 轮次栏；767px 以下两级导航分别进抽屉，正文独占。

URL 使用 target、task、turn。旧 project 链接保留聊天和轮次，映射为 target；无上下文旧聊天链接按所选轮次精确路由定位归属。旧 tab 参数映射为同页章节；?view=routes 保持兼容。新 target 查询和 /api/task-targets 见 task 文档；旧 project 参数及项目接口保留。读取缺口不推测归属。target 最长 4096 字符，与 project 互斥。

四类目标共用 /api/task-targets 和 target 上下文。待创建目标显示标记，落成后同一身份下显示“目标已建立”，不当成主目标切换。目标能力详情与采用能力详情分开；历史节点保留原状态，后续绑定可单独查看。Web 只读，不提供创建资产、绑定编辑或文件访问接口。兼容别名仅来自明确绑定，不按同名合并旧记录。
