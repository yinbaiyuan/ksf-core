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
    text: 任务完成条件
blocker: null
resume_condition: null
context_refs: []
result_refs: []
verification: null
---
# 具体工作

## 目标
要拿到什么结果。

## 当前进展
目前推进到哪里。

## 结果与未决
记已有结果及尚缺什么，按需引用原件。用户主动要求留存上下文时，再创建编号文件或目录。
