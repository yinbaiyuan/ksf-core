---
governance_schema: 2
kind: milestone
id: MILESTONE_ID
name: 阶段结果
status: planned
owner: null
updated: 2026-01-01T00:00:00+08:00
next_action: null
status_reason: null
resume_status: null
blocker: null
resume_condition: null
project:
  id: PROJECT_ID
  path: 项目/项目名称/project.md
goal_ids:
  - GOAL_ID
task_counters: {} # 程序维护已用最大号，人工勿修改
task_stages:
  - code: A
    name: 计划与准备
    purpose: 细化本里程碑目标并补齐必要输入
    exit_criteria: 当前路径和第一批行动明确
  - code: B
    name: 实施推进
    purpose: 按本里程碑实际工作定义具体推进过程
    exit_criteria: 取得可供验收的阶段成果
  - code: Z
    name: 验收与复盘
    purpose: 核对结果、安排遗留并形成复盘
    exit_criteria: 本层验收与复盘结论明确
tasks: []
focus_tasks: []
depends_on: []
criteria:
  - id: MILESTONE_DONE
    text: 本阶段可以验证的结果
review_ref: null
---
# 阶段结果

## 目标与当前判断
本阶段拿到什么，与项目目标有什么关系。

## 任务安排与协调
重点、必要依赖、未决与协调；任务状态回源读取。
