# KSF 运行链说明

运行职责由 [runtime](../../abilities/partners/ksf-runtime/partner.md)持有，项目事实方法由 [project-route](../../abilities/competencies/project-route/competency.md)持有，选择顺序由 [ability-route](../../abilities/competencies/ability-route/competency.md)持有。本文解释这些对象的连接，不提供额外运行判断。

正常入口通过 context entry 提供 USER、BOT、runtime、能力路由和项目路由的完整内容。runtime 保持目标、任务关系及授权；必要项目事实返回后，能力路由确认承接安排。明确指定、有效原安排及项目预设具有现行方法定义的优先级；全局先协作、再普通搭档，均未命中才进入一次基本功路由，再返回通用处理或具体缺口。

基本功路由采用 orphan-competency-match，通过程序查询当前有效引用图的游离候选，核对正文并动态采用适用基本功，继续到实际结果验证。候选、已读、采用和执行是不同事实。程序列举和图解析不执行语义匹配。

六类管理职责分别承接能力、项目、知识、档案、收件箱和人设。专业判断及保存步骤在各领域基本功，确定性操作在程序；没有通用资产维护中枢。跨领域交接通过目标、原件入口、具体请求与实际回执连接。

接口见 [context](../cli/context.md)、[task](../cli/task.md)和 [route](../cli/route.md)；项目恢复方法见项目推进控制。文档中的图示或示例不创建真实 Agent、调度器或额外执行授权。
