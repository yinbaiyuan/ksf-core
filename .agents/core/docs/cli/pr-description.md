# pr-description 命令

读取 [PR 正文模板](../templates/pr-description.md)，或按 [PR 说明规则](../pr-description.md)检查标题和 Markdown 正文。命令只读，不联网、不读取 Git 历史、不修改 Git 或远程 PR。

```sh
.agents/ksf pr-description template
.agents/ksf pr-description template --json
.agents/ksf pr-description check --title 'fix(project): 拒绝覆盖并发更新的项目根卡' --from /tmp/pr-description.md --json
```

check 必须提供一个 --title 和一个 --from，文件仅含正文，标题单独传入。template 仅接受 --json 或单独帮助。操作及命令均支持单独 --help/-h；未知、重复、缺值、位置目标或混用帮助参数退出 2。

相对路径基于 KSF 根，绝对路径原位读取。要求普通 UTF-8 文件，最多 256 KiB，不跟随最终文件的符号链接；CRLF 按 LF 检查，不回写。标题沿用提交规则的 72 Unicode 码点上限和超过 50 的提示，正文最多 60000 个 UTF-16 码元。贡献流程附加的来源说明也计入最终正文上限，因此接近上限的输入仍可能被 prepare 拒绝。

四项必填二级章节按序且各一次：背景与目的、主要变更、验证结果、影响与兼容；其后允许迁移与回滚、审阅重点、关联信息、剩余工作，各最多一次。章节内容须有说明文字，HTML 注释和围栏示例不代替内容，其他子结构可用三级标题。标题 ! 要求非空“迁移与回滚”，未执行验证需说明原因。程序不会自动推断破坏性变更或核实迁移是否可行。

JSON 为 `{ok,command:"pr-description",operation,data,errors}`。check 的 data 包含 valid、title、titleLength、type、scope、breaking、sections、errors、warnings 和 semanticReviewRequired；缺少正文时可能不含 sections。template 返回 path、template。格式通过退出 0，格式或读取失败退出 1，调用错误退出 2。

主要错误包括 PR_TITLE_INVALID／TOO_LONG／PUNCTUATION／CONTROL、PR_SUMMARY_VAGUE、PR_BODY_REQUIRED／SECTIONS／HEADING／PREAMBLE／EMPTY／PLACEHOLDER／CONTROL／TOO_LARGE、PR_VALIDATION_REASON、PR_BREAKING_MIGRATION、PR_FILE_INVALID／UNREADABLE、ENCODING_INVALID。贡献 prepare 将格式不合格汇总为 PR_DESCRIPTION_INVALID，并返回具体检查数据。

semanticReviewRequired 始终为 true。格式通过不证明说明与差异一致、验证真实或信息适合公开。实现见[服务](../../runtime/src/services/pr-description.js)和[命令适配](../../runtime/src/commands/pr-description.js)；验证见[专项测试](../../runtime/tests/pr-description.test.js)及[贡献测试](../../runtime/tests/contribute.test.js)。
