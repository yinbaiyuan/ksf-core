# commit-message 命令

读取[提交信息模板](../templates/commit-message.txt)或按[提交信息规则](../git-commit-message.md)检查完整 Git 消息。命令自身只读，不联网、不读取 Git 历史、不修改 Git 配置或安装 hook。

```sh
.agents/ksf commit-message template
.agents/ksf commit-message template --json
.agents/ksf commit-message check --from /tmp/commit-message.txt --json
```

check 必须提供一个 --from，不接受位置目标。template 不接受 --from。操作支持单独的 --help/-h，重复、未知、缺值或混用帮助参数返回退出码 2。

--from 的相对路径基于当前 KSF 根，绝对路径原位读取。要求普通 UTF-8 文件，最多 256 KiB，不跟随最终文件的符号链接。CRLF 按 LF 检查；不会回写。标题最多 72 个 Unicode 码点，贡献正文另有 60000 字符上限，完整消息也检查大小。

JSON 使用 `{ok, command:"commit-message", operation, data, errors}`。check 的 data 包含 valid、title、titleLength、type、scope、breaking、errors、warnings 和 semanticReviewRequired。template 的 data 返回 path 和完整 template 文本。格式通过退出 0，格式或读取失败退出 1，调用错误退出 2。50—72 码点的标题仍通过，并给出长度提示。

semanticReviewRequired 始终为 true。格式通过不证明消息与差异一致、测试真实通过、兼容性判断正确或内容适合公开；内容核对仍按提交规则执行。

实现见[服务](../../runtime/src/services/commit-message.js)与[命令适配](../../runtime/src/commands/commit-message.js)；回归见[消息与 CLI 测试](../../runtime/tests/commit-message.test.js)和[贡献测试](../../runtime/tests/contribute.test.js)。
