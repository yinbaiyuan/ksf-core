# 工作流接口与结果接管

需要 Core 0.3.5、SDK v1、KSF合作 0.4.0。业务应用拥有流程定义、节点、分支、审批、暂停和恢复；Core 只提供固定方法和受控连接。完整开发说明也随 Core 的系统文档提供，位置 app-development/workflows.md。

提供应用在 Manifest 声明 workflows.contractVersion=1、Node 后端和 background 权限；实现 workflow.list、workflow.describe、workflow.start、workflow.get、workflow.reconcile、workflow.cancel、workflow.signal。所有方法核验宿主 caller.source=workflow。声明固定应用包摘要、流程 revision、公开输入字段、本机固定值和成果映射。

发起应用另需 cooperation.request 权限，先持久保存原 runId、waitId、预生成 taskId、peerId 和稳定 operationId，再通过 SDK createCooperationClient(context).request 调用。workflow.get 返回原运行的 waits 数组供宿主核验。回调关联只在 A 本机保存。

workflow.signal 事件包含 eventId、runId、waitId、taskId、sourcePeerId、outcome(completed/declined/cancelled) 及 delivery。接收应用在自身事务内保存事件并推进原等待点，再返回 accepted=true 与原 eventId；重复事件返回原确认。暂停时保存结果不推进，已结束或失效时保留原因，不能新建替代流程。至少一次通知不等于后续业务执行完成。

材料引用包含 digest、name、size、mediaType；文件位于应用材料目录，宿主核对摘要和大小，不接受任意本机路径。公开字段只包括文本、数字、布尔、枚举及材料等声明字段。示例通过 ksf-app create <目录> --template workflow-provider 生成，包含双向合作和持久去重实现。
