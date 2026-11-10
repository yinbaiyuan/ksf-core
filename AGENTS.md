---
id: "cooperation.ksf.entry"
name: "KSF 入口协同"
description: "KSF 会话入口。"
version: 2.0.0
status: active
references:
  - partner.ksf.runtime@2.0.0
---

# KSF 入口协同

本会话首次进入本实例，直接执行：

```sh
.agents/ksf context entry --json
```

Windows 使用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .agents/ksf.ps1 context entry --json`。跨目录使用本实例启动器的绝对路径。

确认退出码为 0、`ok` 与 `data.complete` 为 true、`errors` 为空；完整读取并遵循 `data.entry.content` 及可选 `data.context.expanded` 中的主文、文件原文与来源。截断先补齐，已提供正文不重复读取。

常规加载、补读和核验直接完成，不逐项播报文件名、路由或回执。自然回应用户的问题，重点表达判断、成果和实质进展；遇到影响任务的异常、明显等待或需要用户决定时，再说明相关情况及建议。
