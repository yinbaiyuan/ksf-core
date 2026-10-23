---
id: "workflow.ksf.entry"
name: "KSF 入口工作流"
description: "KSF 固定入口。先读取 ksf-runtime，由它组织当前工作过程及必要的职责交接。"
version: 0.1.14
status: active
references:
  - partner.ksf.runtime@0.1.13
---

# KSF 入口工作流

收到用户请求后，先读取并遵循 [ksf-runtime](.agents/core/abilities/partners/ksf-runtime/partner.md)。

若该文件不可读，且 `.agents/runtime-data/system/transaction` 存在，先恢复已发起但中断的事务，再重读一次。macOS 使用 `.agents/ksf launcher recover`；Windows 使用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .agents/ksf.ps1 launcher recover`。仍不可读时报告实际缺口，不把其他工作区的定义当作本工作区入口。这里仅提供入口恢复兜底，不检查新版本或启动升级。
