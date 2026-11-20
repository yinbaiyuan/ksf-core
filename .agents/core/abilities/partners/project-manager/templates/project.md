---
governance_schema: 2
kind: project
id: PROJECT_ID
name: 项目名称
status: planned
owner: null
updated: 2026-01-01T00:00:00+08:00
next_action: null
status_reason: null
resume_status: null
blocker: null
resume_condition: null
level: A
mode: finite
phase: definition
parent_project: null
child_projects: []
milestones: []
focus_milestones: []
wip_limit: 1
goals:
  - id: GOAL_ID
    title: 希望改变的结果
    successCriteria: 可观察的成功口径
criteria:
  - id: PROJECT_DONE
    text: 项目整体完成条件
review_ref: null
risks: []
decisions: []
archive_history: []
---
# 项目名称

## 背景与目标说明
为什么做、现状和期待改变。

## 范围与总体路径
包含什么、完成条件及总体路径。

## 约束与重要决定
资源、风险和已确认取舍；未知保留未知。

## 目标产物与保存位置
项目目标对应的本地交付文件保存到本项目“成果/”。明确预期文件；源码、缓存及过程资料保留原处，任务通过result_refs引用。文件生成与验收通过分别判断。
