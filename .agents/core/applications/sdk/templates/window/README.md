# window

从开发手册的 AI-START.md 开始。安装依赖后执行 npm run check、npm run build。AI模板需工作台配置；不在应用中写密钥。业务数据位于宿主 dataDirectory。

测试遵循 SDK 开发手册中的统一测试规范（docs/testing.md）。第一方应用的自有测试必须登记到 Core 测试清单；独立应用保留自己的测试入口。测试装置放在 tests/，生产入口不得导入测试代码。
