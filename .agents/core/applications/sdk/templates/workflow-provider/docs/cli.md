# 应用工作流示例 CLI

先创建运行 `run.create`，再用 `run.request` 从原运行发任务。后者需要 runId、waitId、taskId、peerId、offerId、offerRevision、goal 和稳定 operationId。等待点先保存，再向合作中心创建任务。相同等待点重试复用原编号。

`run.get` 查看原运行、等待点、结果和 continuations。`run.pause` 暂停，结果仍可接管；`run.resume` 消费已收到的结果。人工成果复核只允许在窗口执行。

此示例只整理文本，不调用模型。工作流节点、等待、事件去重与业务继续均由本应用持有。
