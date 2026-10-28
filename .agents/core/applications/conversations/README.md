# 对话工作台应用包

应用开发的唯一规范入口为[应用开发者手册](../../docs/app-development/README.md)；下面仅说明本应用的源码归属。
前端保留原聊天、搜索、轮次、路由、阅读定位；work-stats 为同应用卡片入口。后端负责时间区间和统计聚合，通过公共 tasks.activity 读取记录。

源码位于 `src/` 和 `backend/`，入口为 `frontend.tsx`、`backend.mjs`；清单在 `manifest.json`。

运行 `node build.mjs` 独立构建。SDK 位于同级 `sdk/`；构建器优先使用本应用安装的依赖，也支持当前 Core 工作区已有的锁定工具链。输出 `.build/` 和同级 `store/` 中的安装包及索引。发布不同内容前递增清单版本。

共享接口、生命周期与信任边界见 [SDK](../sdk/README.md)。包中不包含用户项目、对话、Git 工作区或个人设置。
