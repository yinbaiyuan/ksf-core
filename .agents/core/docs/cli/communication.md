# 公共通信 CLI

本地开发实现，2026-10-28，尚未正式发行。由当前 KSF Web 后端持有通信与应用进程；CLI 通过当前根的私有本机控制入口调用。Web 后端未运行时返回 COMM_BACKEND_UNAVAILABLE，不自行启动服务或业务应用。

Agent 可以直接调用本命令，无需选择或安装业务应用。应用业务 CLI 的选择规则另见[应用 CLI](../app-development/cli.md)。示例中的 ksf 在当前实例对应 `.agents/ksf`；Windows 正式运行时分发尚未接入，本次 Windows 验证使用设备现有 Node 直接运行测试代码。

```sh
ksf communication config read --json
ksf communication config write --from config.json --json
ksf communication identity export --json
ksf communication peers list --json
ksf communication peers trust --from peer.json --json
ksf communication peers remove --from peer-id.json --json
```

启用配置：`{"enabled":true,"host":"本机内网 IPv4","port":45731,"discovery":true}`。必须选择本机接口；HTTP 工作台管理入口仍只绑定 loopback。发现使用同子网 mDNS，发现不等于信任。配对输入为 `{"identity":对方导出的公共身份对象,"fingerprint":"经双方核对的完整指纹","host":"对端 IPv4","port":45731,"name":"同事节点"}`；双方分别配对，证书不含私钥。

```sh
ksf communication endpoints open --from endpoint.json --json
ksf communication endpoints configure --from endpoint-settings.json --json
ksf communication endpoints close --from endpoint-id.json --json
ksf communication applications grant --from application-grant.json --json
```

Agent 开箱输入：`{"key":"本机稳定用途标识","channels":["message.v1"],"peers":["允许来信的节点 ID"]}`。输出 endpoint；凭据仅保存本机私有运行目录。configure 输入 endpointId、channels、peers；close 输入 endpointId。相同 key 复用原端点，不重新输出秘密；凭据丢失不能通过再次 open 取回。应用授权输入 appId、channel、peers、activation，activation 控制是否可由消息激活未运行应用。

```sh
ksf communication messages material --file ./说明.md --mime text/markdown --json
ksf communication messages material --file ./附件.zip --json
ksf communication messages send --from message.json --json
ksf communication messages status --from operation.json --json
ksf communication messages reconcile --from operation.json --json
ksf communication messages cancel --from operation.json --json
ksf communication messages inbox --json
ksf communication messages read --from message-id.json --json
ksf communication messages read-part --from part.json --output ./新附件.zip --json
ksf communication messages ack --from message-id.json --json
```

无 `--endpoint` 时以当前 Agent 的本机身份复用邮箱，默认拒绝远端来信，需配置来源。可显式 `--endpoint <已登记端点 ID>`；CLI 从本机私有凭据绑定身份，不信任 JSON 自报 caller。

send 输入：

```json
{
  "operationId": "预先生成的稳定 UUID",
  "to": {"nodeId": "对端节点 ID", "endpoint": {"kind": "agent", "id": "对端端点 ID"}},
  "channel": "message.v1",
  "payloadPartId": "body",
  "parts": [
    {"partId": "body", "materialId": "正文登记返回的 materialId"},
    {"partId": "attachment", "materialId": "附件登记返回的 materialId"}
  ]
}
```

status/reconcile/cancel 输入 `{"operationId":"原操作 UUID"}`。read/ack 输入 `{"messageId":"消息 UUID"}`。read-part 输入 messageId、partId，输出新文件不得覆盖现有文件；未带 --output 时只返回本机受管材料元数据。inbox 可用 --from 输入 `{"after":"上页 nextCursor","limit":50}`。

send 返回异步操作，查询其 preparing/sending/confirming/delivered/failed/unconfirmed/cancelled。只有 delivered 代表对端完整校验并持久接收；消息消费确认和业务接受另行处理。回执丢失先 reconcile 原操作；相同 operationId 必须绑定原参数和原材料引用，不能重新登记材料后改写同一发送。

控制输入最多 1 MiB；材料从文件流上传，默认单条总计 1 GiB。所有本地相对路径以 KSF 根为基准。身份凭据与私钥不是输出字段，CLI 不需要读取任意业务应用手册。

本机分发异常可用 `ksf communication delivery retry --from message-id.json --json` 重新安排；它不补发离线网络消息。完整生命周期、授权与容量见[应用通信](../app-development/communication.md)。
