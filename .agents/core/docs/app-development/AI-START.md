# 给开发应用的 AI：技术入口

应用流程由 [KSF 应用管理](../../abilities/partners/app-manager/partner.md)组织，按当前任务读取 [开发规范](../../abilities/competencies/app-development/competency.md)、[验收](../../abilities/competencies/app-acceptance/competency.md)、[安装更新](../../abilities/competencies/app-installation/competency.md)或[发布](../../abilities/competencies/app-publishing/competency.md)。本页负责技术定位，不另定一套工作流程，也不作为业务程序的运行依赖。

## 先核对实际支持

读取工程 Manifest、SDK 引用和锁文件、目标宿主信息及当前工具帮助。字段、版本与兼容结果以 SDK 类型、校验器和实际宿主返回为准，不从旧例子猜测。公共接口使用 [技术手册](README.md) 定位；接口不一致时保留具体差异，不绕到 Core 私有实现。

| 当前需要 | 对应接口说明 |
| --- | --- |
| 身份、入口、平台与构建 | [Manifest](manifest.md)、[SDK 兼容](sdk-compatibility.md)、[快速开始](quickstart.md) |
| 窗口、卡片与资源释放 | [窗口](windows.md)、[卡片](cards.md)、[生命周期](lifecycle.md) |
| 数据版本、并发及显式迁移 | [后端与数据](backend-data.md) |
| 应用 CLI、文档和版本绑定 | [CLI](cli.md) |
| 通信、材料、保活与工作流 | [通信](communication.md)、[工作流](workflows.md) |
| 统一 AI 服务 | [AI](ai.md) |
| 本地包、应用源及切换结果 | [安装与发布工具](release.md) |
| 按接口排障及场景示例 | [验证说明](validation.md)、[组合示例](recipes.md) |

普通业务 HTTP API 可由后端集成；模型执行经过统一 AI 服务。普通 RPC 是短调用，长 AI 任务提交后保存编号再跟进；没有可用配置时报告真实缺口，不创建假密钥或静默换供应商。使用 CLI、通信或后台的应用只采用当前已实现的公共契约，不能把模拟输入或本机较新宿主成功写成全部目标已验收。

源码/数据归属、只在本机迭代、安装保留数据、公开发布授权、验收结论及交付要求，在上述基本功中统一维护。技术检查与真实业务使用分开记录。
