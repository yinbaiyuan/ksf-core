---
id: "workflow.ksf.entry"
name: "KSF 入口工作流"
description: "KSF 系统运行入口。收到用户请求后，先读取并遵循 ksf-assistant 的定义。"
version: 0.1.0
status: active
references:
  - partner.ksf.assistant@0.1.0
---

# KSF 入口工作流

发行工作区的会话首次进入时，若存在 `.agents/core/release.json` 或 `.agents/runtime-data/system/transaction`，先使用固定入口 `.agents/bin/ksf system sync --quiet`，恢复中断事务并按间隔检查 Release，再读取下方搭档。恢复不依赖 `.agents/core/` 已完整存在；离线或更新冲突时继续现有可用版本并说明实际情况。一次会话只做一次；Core 开发仓库直接读取搭档。

KSF 的运行从系统搭档 [ksf-assistant](.agents/core/abilities/partners/ksf-assistant/partner.md) 开始。收到用户请求后，先读取并遵循该搭档的定义。

## Git 协作

Core 使用 `main` 作为主分支，功能和修复分支无需专用前缀。执行分支、暂存、提交、合并或推送前，读取并遵循 [Git 协作规则](.agents/core/docs/git.md)，核对系统内容与用户数据的边界。
