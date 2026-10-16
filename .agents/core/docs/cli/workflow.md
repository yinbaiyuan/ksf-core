# workflow 命令

已实现。普通工作流承载多个搭档的协同机制。根 AGENTS.md 是特殊入口，由程序标注 protected，路由时排除，不作为下游业务工作流。

## 位置与公共规则

系统区 `.agents/core/abilities/workflows/`，用户区 `能力/工作流/`，入口 `workflow.md`。对象以整个承载目录为单位；新用户目录使用完整三段 ID，类型标识为 `workflow`。专业对象边界见[工作流说明](../objects/workflow.md)。

五个操作的参数、输入输出、错误码、接管及写入规则统一见[对象命令公共规则](objects.md)，字段契约见[对象元数据规范](../对象元数据规范.md)。日常写入只影响用户区，首次修改系统对象自动派生完整目录及 .upstream/ 基线；不另建本类型的例外语义。

## 调用

```sh
.agents/ksf workflow --help
.agents/ksf workflow list --source all --json
.agents/ksf workflow read workflow.yinchao.sample --part metadata --json
.agents/ksf workflow read workflow.yinchao.sample@0.1.0 --part body --source user --json
.agents/ksf workflow check workflow.yinchao.sample --json
.agents/ksf workflow write workflow.yinchao.sample --data '{"metadata":{"name":"示例","description":"说明用途、结果与边界","status":"draft","version":"0.1.0"},"body":"# 示例定义\n"}' --dry-run --json
.agents/ksf workflow remove workflow.yinchao.sample --dry-run --json
```

示例 ID 为占位用法；不存在的 read/check/remove 报错。去掉 --dry-run 后才实际创建、修改或物理删除整个用户目录。read 默认 --part all，--source 默认 effective；list 返回摘要，不能把列举成功当作正文已读取。

## 检查与实现

check 覆盖公共契约、类型与位置、重复身份、本地精确引用和用户基线，不判断工作流正文专业质量。空目录允许，目录或对象损坏会明确报错，部分有效项与完整性分别报告。

本类型复用共享对象服务与测试，不维护独立解析器。测试与真实入口验证的范围、源码位置和失败恢复方式见[公共规则](objects.md)。返回[索引](index.md)。
