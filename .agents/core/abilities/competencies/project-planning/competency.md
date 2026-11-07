---
id: "competency.ksf.project-planning"
name: "项目拆计划"
description: "沿已确认方案分解子项目、里程碑和任务，通过阶段式引导明确成果、依赖、责任和当前一小批行动，形成滚动计划。"
version: 0.3.2
status: active
references: []
---

# 项目拆计划

## 结果与使用

沿已确认方案分解子项目、里程碑和任务，通过阶段式引导明确成果、依赖、责任和当前一小批行动，形成滚动计划。

输入：有效方案、完成条件、现实资源、期限和当前安排。

## 执行方法

先读[阶段引导](references/process.md)当前步骤及必要前后衔接。每步明确目的、输入、引导、动作、阶段产物和退出条件，按实际信息判断推进；已有决定复用，关键缺口再问一两个问题。默认逐阶段给分析与候选，允许用户修正；不将每条工具操作变成确认仪式。

[模板入口](templates/README.md)提供当前正式文件模板；[完整交互样例](examples/guided-project.md)和[评估案例](evals/cases.json)用于检查实际过程。只读当前所需资源，不逐轮全包加载。

## 保存、恢复与边界

持有计划与分解，不代替定方案作重要价值取舍，不把任务目录数当进展。用户已要求实际工程交付且缺工作区时，可沿repository create/link的预览、执行和check安排工程；不因建计划顺带提交Git或创建远程。

当前进度和业务事实保存在项目原件；未结束的引导使用guidance:{method,step,pending_questions}保存当前步骤、已确认结论入口和待问问题，不记录隐藏推理或另一份对话史。next_action只在所属对象维护。原件/状态、读写与冲突规则见[公共治理接口](../../partners/project-manager/references/governance.md)。

采用前读取本对象user-data；本版没有必须初始化的独立偏好或跨项目状态。写入使用读取基线和operationId，先预览再实际保存，最后读回；并发冲突保留草稿再合并。阶段结果和必要接续信息已检查时结束；模拟走查、程序回归和真实用户效果分别记录。

新增任务按[治理定义](../../partners/project-manager/references/governance.md)调用公共create-task，阶段由本方法引导确定，最终任务号、文档和索引由程序生成。只支持新版字母阶段，旧项目迁移另行处理。
