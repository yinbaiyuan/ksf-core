# KSF飞轮应用包

原名“对话工作台”。连接工作记录、回顾审查与改进建议，让经验进入下一轮工作。应用身份、数据和已有入口保持连续。

应用开发的唯一规范入口为[应用开发者手册](../../docs/app-development/README.md)；下面仅说明本应用的源码归属。
前端提供工作回顾、待处理建议和原聊天、搜索、轮次、路由、阅读定位；work-stats 为同应用卡片入口。后端通过公共 tasks 读取活动及带版本的证据，通过统一 AI 服务分批整理，持有报告、建议、审阅与归档状态。完整用法与边界见[每日回顾说明](../../docs/daily-work-review.md)。

后台为 resident，但定时需要先选择现有 profile 或 Desktop 路径与项目并启用；默认 Asia/Shanghai 06:00。没有配置不发起模型请求。报告和审阅在 user 范围的 reviews.sqlite，执行恢复在 runtime 范围的 review-runs.sqlite；SQLite schema 1，未知版本保留并拒绝。SQLite 是应用自行管理的数据，备份及回退边界见用法说明。

测试入口为 runtime/tests/conversation-review.test.js 、conversation-review-desktop.test.js 和 conversation-review-process.test.js，后者实际安装随包应用、关闭并重建受管子进程，核对原 AI 编号、报告、建议与归档保留。模拟 AI 与真实业务日报分别验收。CLI 见[入口说明](docs/cli.md)。

源码位于 `src/` 和 `backend/`，入口为 `frontend.tsx`、`backend.mjs`；清单在 `manifest.json`。

运行 `node build.mjs` 独立构建。SDK 位于同级 `sdk/`；构建器优先使用本应用安装的依赖，也支持当前 Core 工作区已有的锁定工具链。输出 `.build/` 和同级 `store/` 中的安装包及索引。发布不同内容前递增清单版本。

共享接口、生命周期与信任边界见 [SDK](../sdk/README.md)。包中不包含用户项目、对话、Git 工作区或个人设置。
