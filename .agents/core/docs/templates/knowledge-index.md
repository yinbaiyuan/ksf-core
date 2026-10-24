# 知识导航与框架模板

唯一模板源在 Core 的 distribution/template/知识/，新工作区由发行程序按显式白名单生成。生成后归用户实例维护；Core 升级和回滚不覆盖定制，也不补写缺失文件。

| 模板 | 职责 |
| --- | --- |
| [knowledge.md](../../distribution/template/知识/knowledge.md) | 只概述直接下级的内容、组织方式和入口，不承载详细规则或业务正文 |
| [rules/README.md](../../distribution/template/知识/rules/README.md) | 可编辑的默认命名、单元边界、入口、来源、引用和规则扩展约定 |
| [rules/认知.md](../../distribution/template/知识/rules/认知.md) | 可选认知类型的三层结构、四条路径与五步职责 |
| [cognition.md](../../distribution/template/知识/rules/templates/cognition/cognition.md) | 认知主题简短定义、三个分区导航及五步概述 |
| [认知说明.md](../../distribution/template/知识/rules/templates/cognition/3认知/认知说明.md) | 五步详细认识骨架，未知内容保持待形成 |

知识单元默认同级使用“单元类型-具体名称”。认知采用“认知-名称/cognition.md”；其他类型按自己的框架与实际入口，不强制认知模型、对象 ID 或类型注册表。模板的空分区通过 .gitkeep 保留，没有真实主题和默认用户记录。

已有实例的采用、新建主题与链接重定位按[知识组织基本功的采用方法](../../abilities/competencies/knowledge-organize/references/core-framework.md)处理。只在用户明确采用或创建时形成必要差异，不整体覆盖实例规则。读取与组织分别处理，导航保持逐层概览，程序检查不代替内容判断。
