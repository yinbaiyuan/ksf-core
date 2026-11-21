---
governance_schema: 2
kind: task
id: TASK_ID
name: 具体工作
status: planned
owner: null
updated: 2026-01-01T00:00:00+08:00
next_action: null
status_reason: null
resume_status: null
work_type: delivery
task_code: B1 # 由create-task实际分配，此处仅示例
project:
  id: PROJECT_ID
  path: 项目/项目名称/project.md
milestone:
  id: MILESTONE_ID
  path: 项目/项目名称/M1-阶段结果/milestone.md
goal_ids:
  - GOAL_ID
commitment: candidate
priority: normal
depends_on: []
criteria:
  - id: TASK_DONE
    text: 在约定场景中取得可观察结果，通过明确办法由责任方核对
blocker: null
resume_condition: null
context_refs: []
result_refs: []
verification: null
---
# 具体工作

## 目标
要拿到什么具体结果及本次边界；可以直接引用代码能力、运行入口或方案。需要本地交付文件时再明确所属项目的成果路径及用途，固定版本按治理定义办理，通过result_refs关联。

## 当前结果
已实际取得什么结果、当前采用什么；按需引用原件和检查证据，保持当前摘要，不逐轮追加过程流水或另造成果报告。

## 未决与缺口
还缺什么、哪些需要用户体验或外部结果核对。下一行动只写元数据 next_action；用户主动要求留存上下文时再创建编号材料。
