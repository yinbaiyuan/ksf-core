# 项目 routing 配置模板

将需要的部分加入项目根卡 frontmatter；不用的列表省略或设为空，整个 routing 也可省略。下面均为虚构示例，应替换为实际可读的对象、精确版本、来源和知识文件后再检查，不自动为真实项目创建这些内容。

```yaml
routing:
  workflows:
    - ref: workflow.example.delivery@0.1.0
      source: team-methods
  partners:
    - ref: partner.example.editor@0.1.0
  competencies:
    - ref: competency.example.review@0.1.0
  data_packages:
    - ref: data-package.example.materials@0.1.0
  knowledge:
    - ../../知识/某主题/README.md
```

source 可省略，省略采用 effective 解析；显式值为 effective、user、system 或已关联源 ID，不能使用 all。source 仅定位该项，不过滤全局其他候选，也不更改对象原有依赖绑定。固定运行入口不能作为项目预设。

项目预设优先但不是强制入口或候选白名单；当前指令和继续任务的有效安排仍优先。基本功和数据包是按需支持，不代替工作流或搭档，也不覆盖它们的精确依赖。知识路径相对根卡，用普通路径而不是 Markdown 链接，指向当前实例知识目录中的普通 UTF-8 Markdown 文件，不接受绝对路径或符号链接。

使用现有 `project write` 保存，`project read` 查看原始配置，`project check <项目目录名> --json` 检查逐项结果。写入只校验结构，允许先记录尚未可用的精确引用；可用性以 check 和实际采用时的重读为准。失败保留配置及其他可用项，不自动换版本、修复或安装。完整约定见[项目 CLI](../cli/project.md)和[三路由协作](../runtime/routing.md)。
