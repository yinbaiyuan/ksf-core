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
要拿到什么结果；涉及本地目标文件时明确所属项目的“成果/名称-v1.扩展名”，通过result_refs关联。

## 当前结果
已实际取得什么结果，按需引用产物和检查证据。

## 未决与缺口
还缺什么、哪些需要用户体验或外部结果核对。下一行动只写元数据 next_action；用户主动要求留存上下文时再创建编号材料。
