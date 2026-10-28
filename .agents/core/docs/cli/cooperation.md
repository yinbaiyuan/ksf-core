# cooperation 命令

已实现。普通协同承载多个搭档的协同机制。根 AGENTS.md 是特殊入口，由程序标注 protected，路由时排除，不作为下游业务协同。

## 位置与公共规则

系统区 `.agents/core/abilities/cooperations/`，用户区 `能力/协同/`，入口 `cooperation.md`。对象以整个承载目录为单位；新用户目录使用完整三段 ID，类型标识为 `cooperation`。专业对象边界见[协同说明](../objects/cooperation.md)。

五个操作的参数、输入输出、错误码、接管及写入规则统一见[对象命令公共规则](objects.md)，字段契约见[对象元数据规范](../对象元数据规范.md)。日常写入只影响用户区，首次修改系统对象自动派生完整目录及 .upstream/ 基线；不另建本类型的例外语义。

## 调用

```sh
.agents/ksf cooperation --help
.agents/ksf cooperation list --source all --json
.agents/ksf cooperation read cooperation.yinchao.sample --part metadata --json
.agents/ksf cooperation read cooperation.yinchao.sample@0.1.0 --part body --source user --json
.agents/ksf cooperation check cooperation.yinchao.sample --json
.agents/ksf cooperation write cooperation.yinchao.sample --data '{"metadata":{"name":"示例","description":"说明用途、结果与边界","status":"draft","version":"0.1.0"},"body":"# 示例定义\n"}' --dry-run --json
.agents/ksf cooperation remove cooperation.yinchao.sample --dry-run --json
```

示例 ID 为占位用法；不存在的 read/check/remove 报错。去掉 --dry-run 后才实际创建、修改或物理删除整个用户目录。read 默认 --part all，--source 默认 effective；list 返回摘要，不能把列举成功当作正文已读取。

## 检查与实现

check 覆盖公共契约、类型与位置、重复身份、本地精确引用和用户基线，不判断协同正文专业质量。空目录允许，目录或对象损坏会明确报错，部分有效项与完整性分别报告。

本类型复用共享对象服务与测试，不维护独立解析器。测试与真实入口验证的范围、源码位置和失败恢复方式见[公共规则](objects.md)。返回[索引](index.md)。

## 从旧工作流能力迁移

Core 0.2.0 将 Agent 的工作流能力改为协同。新接口使用 `cooperation.*`、`cooperation.md`、`routing.cooperations` 和 `context capabilities` 的 `cooperations` 分组；旧命令、ID 和路由字段返回迁移提示，不提供可调用别名。能力源声明使用 `schema_version: 2`；旧源须由显式迁移升级后才能正常发现。

```sh
.agents/ksf cooperation migrate --dry-run --json
.agents/ksf cooperation migrate --apply --json
```

必须指定预览或执行，两者不能同时使用。预览不创建锁、备份或目录，不更新状态。执行范围包括当前实例和已关联的本地能力源：有效定义及精确引用、目录和入口、项目预设、派生基线、对象设置，以及由旧 ID 派生的聊天状态路径。聊天的 runId、参与轮次、变量和计数保留，修订号递增。根入口、运行说明中的现行概念也同步更新。普通启动和查询不自动执行迁移。

迁移前应排空相关写入并重新加载持有旧代码的服务。执行过程在 `.agents/runtime-data/cooperation-migration/` 保存事务状态；每次执行的 `backups/<迁移ID>/` 保存原始字节、目标字节及清单。若中断，再运行 `--apply` 继续；已完成的操作按摘要识别，不重复改写。未完成事务会阻止普通 CLI 及受管对象、配置、聊天状态写入。输入并发变化、目标冲突、符号链接、损坏数据或派生基线校验失败均停止，保留现场，不覆盖或合并目标。完成后重复执行无差异。

历史对话、签名回执、路由快照及其摘要保持原始字节。历史读取允许旧格式，并通过显式身份映射返回 `currentIdentity` 关联当前协同；这一兼容只用于读取，不能作为新声明的旧 ID 别名。GitHub Actions、第三方 API 和上游原文中的合法 workflow 用法保留。
