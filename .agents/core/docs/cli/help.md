# 帮助

已实现。帮助是选项，不是独立顶级命令。

```sh
.agents/bin/ksf
.agents/bin/ksf --help
.agents/bin/ksf -h
.agents/bin/ksf metadata --help
.agents/bin/ksf metadata read --help
.agents/bin/ksf project --help
.agents/bin/ksf project write --help
.agents/bin/ksf partner --help
.agents/bin/ksf partner write --help
```

四类对象、project 及 metadata 都有命令级、操作级帮助；操作级帮助不能与目标或其他选项混用。帮助使用文本输出，退出 0。错误用法退出 2；启动准备失败可在帮助生成前退出。

顶级帮助只列出实际支持的命令；discover 尚未实现，不加入可执行列表。启动层仍可能准备 Node，详见[能力说明](overview.md)。返回[索引](index.md)。
