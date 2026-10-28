# test 命令说明

设计与后续扩展统一遵循 [CLI 命令设计规范](../CLI命令设计规范.md)。已实现行为与待实现接口分别标注。

## 状态与职责

已实现。通过统一入口准备随包 Node，使用同一可执行文件的内置 `node:test` 运行 JavaScript 测试。

## 调用

```sh
.agents/ksf test
```

当前不支持 `--json`、测试过滤、附加文件参数或其他选项。

## 执行与输出

CLI 在运行时目录启动 `node --test`，显式传入 `tests/` 和 `web/tests/` 中的 `*.test.js`、`*.test.cjs`、`*.test.mjs`、`*.test.ts` 文件，继承测试输出，并清除子进程中的 `NODE_TEST_CONTEXT`，保证嵌套调用时测试运行器独立启动。不会自动执行随包第三方依赖的测试、辅助进程脚本或需要明确启用的真实 AI 验收程序。

输出由测试运行器直接提供，不包装成业务 JSON。子进程正常退出时传递其退出码；无法启动或未取得正常退出码时返回 1。CLI 参数错误返回 2。

现有测试覆盖启动准备、manifest 构建及 CLI 分发。测试数量以源码和本次实际输出为准，本文件不维护另一份固定计数。

## 文件影响与结果边界

启动准备可能更新 `.agents/runtime-data/runtime/`。现有测试在独立临时目录创建夹具并清理，不以主工程用户资料作为测试写入目标；新增测试也应明确隔离其副作用。

测试通过仅证明实际覆盖的行为，不证明跨平台支持、真实任务完成、知识沉淀效果或尚未实现命令可用。运行测试不自动生成主工程 manifest。

## 实现与验证来源

- [CLI 测试入口](../../runtime/src/cli.js)
- [CLI 测试](../../runtime/tests/cli.test.js)
- [启动测试](../../runtime/tests/bootstrap.test.js)
- [构建测试](../../runtime/tests/build.test.js)

本文整理调用规则，本轮未执行测试。返回[索引](index.md)。
