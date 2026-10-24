# eval：自然语言项目、能力与资料采用评测

## 状态与职责

本地真实 Agent 评测入口，与 `ksf test` 的确定性程序测试分开。实现检查、显式运行与历史读取；首版只支持 macOS Codex CLI，使用已有认证和明确配置的模型。不登录、不安装模型、不改生产路由或自动修复业务材料。方法及证据边界见[评测机制](../runtime/routing-evaluation.md)。

## 调用

```sh
.agents/ksf eval check routing --json
.agents/ksf eval run routing --profile calibration --json
.agents/ksf eval run routing --profile core --json
.agents/ksf eval read <run-id> --json
```

`check` 离线检查案例结构、必要实例文件、CLI/认证配置、macOS隔离探针，不调用模型；会创建并清理本机临时探针。`run` 才实际调用模型。`read` 只读取报告，不复跑或重新评分。

| 参数 | 行为 |
| --- | --- |
| 操作 | check、run、read，必填；各操作支持单独 `--help` / `-h` |
| 目标 | check/run 必须为 routing；read 必须为精确 run-id，不按“最近”猜测 |
| --profile | run 必填，calibration 或 core；无默认，不可重复 |
| --json | 单次布尔选项，只改变格式；stdout 一个完整JSON，进度写stderr |

未知、重复、缺值及不适用参数报调用错误。首版案例源固定，不支持任意套件或模型覆盖参数；采用当前用户已配置的 Codex model、reasoning effort。自定义provider和缺少显式model时报清楚缺口，不自动替换模型。

## 运行、配置与文件影响

两条真实实例案例保存在本实例的 `.agents/user-data/eval-routing.json`，不是公共Core示例，也不是能力对象的默认记录。文件为 `{schemaVersion:1,cases:{P02:{turns:[{prompt}],expected:{criteria,requiredReads},reservedExpressions:[]},K02:{...}}}`；仅P02/K02可配置，读取路径须在当前实例内且实际存在。其他实例须明确提供自己的真实案例；缺配置时报错，不用虚构材料冒充真实实例。该测试配置不复制给被测Agent，也不通过对象user-data接口注入能力。

宿主守卫可能阻止原生证书缓存刷新，适配器会导出Apple随系统提供的公开根证书到私密临时目录，或复用已明确配置的 `CODEX_CA_CERTIFICATE` / `SSL_CERT_FILE`。每次调用记录证书束摘要与来源，仍完整验证TLS，不修改系统信任或加入任意登录钥匙串证书。[官方环境变量说明](https://learn.chatgpt.com/docs/config-file/environment-variables)记录这两个CA变量。CLI不支持所配置模型时保留明确错误，不自动降级；升级CLI须由用户单独授权。

每例使用新的临时副本、独立 Codex home、新会话与固定输入；多轮按精确 session ID 继续，暂停恢复场景另开空白会话。隔离配置禁用记忆、插件、Apps、MCP继承、浏览器、自动委派和业务网络。使用新版CLI的单层原生 `ksf-eval` 权限配置：最小系统路径可读、仅本例临时目录可写、真实实例与全局用户目录及认证宿主目录拒绝工具读取、工具网络关闭。实际读写探针通过才运行，不叠加macOS沙箱导致工具启动失败。认证仅由宿主在私密临时目录使用，结束后清除，不进材料、日志或报告。权限控制针对本地工具，宿主仍需读取自身认证与配置；不是整个CLI进程的物理容器隔离。该配置区别于用户日常桌面全部连接器环境，不能以CLI结果证明桌面或跨宿主效果。

快照使用当前工作树；保留Core和所需材料摘要及路径映射。测试预期、评分器、程序测试、历史报告不复制进被测工作区。真实实例样例复制项目根卡、能力、知识及能力源；业务任务额外依赖未复制工程或检查点时应按夹具问题处理，不能冒充完整真实环境。虚构样例不污染正式项目。符号链接、缺失源等不能安全复制的情况保留实际错误，不静默跳过。每次复跑新建记录；既有原始事件不覆盖。

证据保存在 `.agents/runtime-data/verification/routing-<UTC时间>-<随机ID>/`：frozen、snapshot.json、各案例contract/initial/turn事件/observation/assertions/review/result、report.json及report.md。未收集隐藏思维链，CLI reasoning 项也不写入事件日志。读取响应有大小上限时不截断后冒充完整；损坏/未知工具事件和超限保留为不完整证据。

默认串行；每个场景的被测与评审共享15分钟上限，多轮共享这一额度，不自动重跑整例。运行/评审装置异常时保存已得证据并停止批次，报告保留未执行数量。Codex自身的API传输重试与场景复跑不同，按其实际事件保存。暂不提供后台调度或自动清理历史证据。

## 判定、校准与错误

组合读取命令即使因其他文件不存在而退出1，先前成功读到的原文仍可采用。不因同一次调用含ls/find/rg --files就整体排除cat或其他正文读取片段；纯目录列举仍不算读取。固定入口用准备时的完整原文长度和sha256核对全部正文，不能用首尾片段代替全文；对象JSON读取核对完整body摘要。普通业务原文允许有来源匹配的章节或行读取，由语义评审继续判断充分性。不把错误文本、未执行的命令或文件名当正文。虚构用户对象复用公共元数据校验。

大检索输出不塞入单个超长评审消息，也不静默截断：完整输出保存为带sha256和长度的outputRef等文件，评审者可在只读证据工作区按需检索。输入包及其全部外置文件同时归档于每例review-input目录，保留实际观察、完整引用和最终评审。若外置后协议本身仍超过上限则保留装置异常。评审者不能改写证据工作区。

所有宿主目录统一放在工具拒读的host-homes父目录下；独立恢复前删除前一个宿主目录，评审前删除全部被测宿主目录。即使临时目录允许写入，工具也不能读取其他宿主的认证与会话历史。评审的disputes仅记录未解决冲突或验收歧义；说明性备注放interpretation。已有非空争议仍保留待人工复核，不自动重新解释成通过。

`expected.requiredReads`表达必须读取的原件；`requiredReadGroups`为二维路径列表，每组读取其中一个适用原文即可。比如同一知识方法的总览、正文都能提供依据时，不能仅因没读指定文件名误判。评分仍须检查原文确实适用及实际采用，而非只满足任意一次读取。

结果分别保留runStatus（valid/infrastructure_error/harness_error）、reviewStatus、verdict（pass/fail/indeterminate）、硬断言、五维度判断、引用事件和争议。业务失败不等于运行装置失败；同名对象或文件被读过不等于已采用。缺关键证据不通过，硬违规不能平均掉；只允许专业采用维度按实际需要记not_applicable，无项目与无需知识属于可以判定的正常分支。

套件1.1.0另以abilityChecks分别记录preset_order、selection、exception_notice；实际方法使用继续由adoption维度承担。子项失败不能被能力维度通过覆盖；子项无法判定不能汇总成能力通过。A01用presetPriority标明适用项目的正文核对顺序，程序按实际读取与project check事件核验；发现摘要可以提前取得，不把正文读取推定成采用。异常说明检查全部用户可见消息，允许中途告知后最终只给用户所需文案。

calibration 包含6个真实被测场景及独立评审，另有8个**制造证据的评分器挑战**：原有错误路线/未读原文、缺关键证据、合理通用替代，加上同一顺序违规的两种表述、正确预设顺序、仅工具错误未告知、已中途告知。除总体结论还核对指定能力子项，避免硬断言失败掩盖AI评审自身判错。挑战不计入真实路由案例通过率。程序聚合自检另列，不冒充模型评审校准。

校准门槛检查测试装置是否可信：6例运行及评审有效、无无法判定，8个评审挑战符合预期、程序自检通过。明确识别出的KSF路由失败仍保留失败，不通过修改规则或答案来抬分。core 必须找到同套件、同快照摘要、同宿主配置的已校准记录，才执行24场景共40例次（8场景3次，其余1次）。改源码、输入材料、配置后重新校准。

JSON遵循公共 `{ok,command,operation,data,errors}` 信封。run 全部通过且完整才ok；失败、无法判定或未完成返回1及已有报告。read 成功读取失败报告仍返回0，验收结果留在data。调用错误2。稳定错误包括 `EVAL_PRECHECK_FAILED`、`EVAL_CALIBRATION_REQUIRED`、`EVAL_ISOLATION_FAILED`、`EVAL_SESSION_NOT_INDEPENDENT`、`EVAL_REVIEW_PACKET_LIMIT`、`EVAL_RUN_NOT_FOUND`。读取中断的running报告不把它变为completed。

## 实现与验证

CLI适配位于runtime/src/commands/eval.js；案例、快照、执行器、证据、评分聚合及运行编排位于runtime/src/eval/。eval.test.js用假执行器离线验证协议、六例/四十例编排、会话延续、门槛、异常、证据缺口和越界；真实Codex与独立AI的结果只由各次运行报告证明。

当前套件为 2.0.0，维度为 project、ability、materials、adoption、boundary。24 场景、6 例校准和核心 40 例次及 eval routing 接口保持；项目事实由项目入口提供，配套资料由能力或数据包明确指定，显式知识任务按本次范围读取。旧报告按保存版本原样读取，不重新判分；旧校准不作为新套件门槛。

expected.forbiddenReads 为可选禁止读取的实例内路径列表。已观察到正文读取为硬失败；缺原件指纹、轨迹不完整或存在无法解释的读取工具时保留无法判定。程序没有匹配到路径不等于证明所有读取均合规，语义评审仍检查实际资料范围。普通 ksf test 与 eval check 不调用模型。
