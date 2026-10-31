# KSF手册应用

只读、无应用后端的SDK v1随附应用。通过公共文件读取接口取得当前Core的docs/catalog.json和正文，媒体使用公共媒体接口，外部来源由用户打开。

使用同级SDK构建：node build.mjs。前端依赖沿用当前锁定工作台工具链，独立安装时使用本应用package-lock。输出为同级store中的不可变.ksfapp；正文和搜索索引由Core维护，不复制进应用包。

model.mjs由文档生成器与阅读器共用标题、链接、搜索和历史规则。窗口状态仅保存在SDK会话，不写业务存储。查看原文通过SDK打开现有文档应用，不在本应用解锁或编辑。

使用与完整契约见[阅读器说明](../../docs/handbook/documentation-reader.md)、[应用手册](../../docs/app-development/README.md)。版本、摘要及本次真实验收由项目交付记录持有，不以构建成功替代。
