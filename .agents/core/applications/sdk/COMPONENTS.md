# Agent 组件查询

`ksf-app components` 是 SDK 自带的离线只读工具，协议为 `ksf-components-v1`。无需启动 KSF 或安装组件库应用。组件库页面与工具共用数据；应用仍可选择其他组件库。准备使用KSF组件时查询，不把目录当作必须采用的清单。

```sh
ksf-app components search "保存操作" --app-dir ./my-app --json
ksf-app components read ACT-01 --app-dir ./my-app --json
ksf-app components example button.basic --app-dir ./my-app --json
ksf-app components read INP-16 --include-proposal --json
ksf-app components --help --json
```

把 `./my-app` 替换为应用源码目录。未将SDK工具加入PATH时，用 `node 实际SDK目录/scripts/ksf-app.mjs` 替代 `ksf-app`。不要把另一个SDK工具包的版本当作目标应用版本。

## 操作与结果

| 操作 | 规则 |
| --- | --- |
| search | 编号、中英文名称、别名和用途关键词，确定性排序；默认只查已具备，`--include-planned`包含待实现。`--limit`范围1—200，默认20。返回摘要，不预加载全量API和源码。 |
| read | 稳定编号或唯一名称，返回契约、接口、前提与目标支持。`--include-proposal`显式取候选规格，单列在`proposal`，不进入正式API。 |
| example | 必须指定示例编号，使用目标SDK内对应版本。核对通过后返回完整源码、来源及SHA-256。未知编号不回退到其他示例。 |

`ok`表示操作成功。`component.delivery`为`available`或`planned`；`targetSupport.status`为`supported`、`unsupported`、`unknown`或`notApplicable`。只有`supported`对应`canGenerateSdkUsage:true`。

读到待实现条目可以`ok:true`，其`contract`、`binding`、`releasedApi`为null，`examples`为空数组；获取其示例则`ok:false`，CLI退出码为1。例如WheelPicker（INP-16）仍为待实现项。

未指定`--app-dir`时可读目录和通用契约，`target:null`，已具备项为`unknown/TARGET_REQUIRED`；获取可接入示例失败。`catalogSource`标识工具的目录来源，`contractSource`标识实际读取的SDK契约来源，两者可以版本相同但摘要不同。支持结果附编译器版本、示例编号和SDK内容摘要，仅适用于查询时内容。

## 目标核对

读取目标SDK声明与实际安装位置，支持安装包、workspace链接与`file:`目录；按真实路径处理链接和带空格目录。静态识别项目本地`ksf-app build/local`，以及导入公共SDK `build.mjs`的常规Node构建脚本，不执行应用脚本。

依赖、安装位置、构建来源或显式来源冲突为`unknown/SDK_SOURCE_MISMATCH`。构建方式不明为`BUILD_SDK_UNRESOLVED`，核对后可用`--sdk-root`显式指定，它不能覆盖已发现的冲突。SDK路径按命令当前目录解析。精确版本声明不匹配为`SDK_VERSION_MISMATCH`；tsconfig中SDK别名冲突为`SDK_TYPE_SOURCE_MISMATCH`。

检查公共子路径、类型及运行导出；私有文件存在或构建别名能访问不证明公共接口。JS运行导出与声明分别核对，不能识别的条件导出保留unknown。读取目标正式契约，校验数据、源码依赖与示例摘要，再用锁定TypeScript工具编译命名导出探针和所需示例。类型环境缺失为unknown，明确类型不兼容为unsupported。临时文件仅在系统临时目录生成并清理，不修改应用。

旧SDK无元数据时不合成契约：缺公共入口可判unsupported，其余保持`unknown/SDK_METADATA_MISSING`。查询不安装依赖、升级SDK、执行目标代码、改Manifest或调用平台服务。组件支持不替代`builtWithSdkVersion`、`sdkApiVersion`、`minCoreVersion`原校验，也不替代宿主、交互或业务验收。

## 维护与公共接口

唯一目录在`components/catalog.json`，正式契约在`components/contracts.json`，候选规格在`components/proposals.json`。目录包括组件、基础机制、组合模式与扩展，数量以同源元数据为准，不代表每条都有独立公共入口。已具备必须对应正式契约，待实现不得带正式契约。

真实示例在`src/component-examples/`，组件库直接运行，并从同一文件读取展示/复制源码。契约保存示例编号与来源，CLI核对通过才返回目标源码。

维护者核对契约、默认值和实现后运行`npm run components:generate`生成`components/integrity.json`；`npm run components:check`验证同步。摘要包括数据、包声明、公共实现、声明文件、相对源码依赖与示例。此检查属于SDK自身维护，不给其他应用新增强制组件或运行时要求。

Node工具可从公共`@ksf/sdk/component-tools`调用`queryComponents`。浏览器从`@ksf/sdk/component-catalog`读取目录和无目标契约；不能假定浏览器拥有本地目标工程，它明确返回未核对目标。

当前正式契约、同源示例与待实现候选由目录查询返回；AI相关能力已独立分类。Ant Design 6.7.1主目录73项逐项映射到KSF组件或SDK基础设施；86个KSF条目记录了实际采用的Ant基线。接口、主题和窗口机制属于KSF，不依赖antd运行时。

来源单一数据源为`components/references.json`：按KSF ID维护target、adopted、固定版本源码/文档、differences及notCovered。仅目标版本变化不会自动改写实际采用版本；比较上游差异、适配与验证后才更新受影响组件。独立子包采用精确版本记录，例如QRCode编码使用qrcode 1.5.4。Icon仅采用文档呈现参考，未采用@ant-design/icons资产或代码。

来源元数据、示例和正式契约共同纳入完整性校验。组件详情API页和Agent查询都读取这份来源数据。应用仍可按需选择KSF或其他组件，不要求加载全库。
