# 后端、生命周期与数据

SDK工具包为1.0.0，清单schemaVersion与运行协议sdkVersion均为1，最低Core明确声明。本契约完整起步，不按历史结构提供适配分支。

## 后端与运行

后端导出 `activate(context)`，返回 `call(method,params,caller?)`、可选 `startBackground()`、`onMessage()`、`dispose()`。同一应用版本共享受管后端；窗口与卡片持有各自租约，业务状态不能放在“当前窗口”全局变量。`on-demand` 按调用激活，`resident` 要求background权限及startBackground；详见[生命周期](lifecycle.md)。

`context.tasks.run(action)` 只保活本次进程中的工作。`context.background.retain({key,reason})` 保存跨主服务重启的运行需求，业务结束后release；恢复步骤与去重由应用持有。RPC等待超时不等于业务停止，结果未知时按原操作编号查询，不能盲重放。关闭前端不停止有后台需求的应用，停止主服务则停止受管后台。

## 存储范围与声明

| scope | 目录 | 用途 |
| --- | --- | --- |
| user | .agents/user-data/applications/data/<appId>/ | 用户业务数据 |
| runtime | .agents/runtime-data/applications/data/<appId>/ | 本机持久状态；被Git忽略，重启后保留 |

包目录不可变。runtime不等于可丢弃缓存，删除运行目录会删除其中的数据和设备身份。原件、缓存、凭据和业务备份须分别设计；不把模型密钥写入普通JSON。

清单声明固定文件：

```json
{"name":"state.json","scope":"user","schemaVersion":2,"migrateFrom":[1]}
```

普通 JSON 顶层带schemaVersion，内部结构保持应用原样。SDK封装为 `{schemaVersion,revision,data}`。版本2仅用于下例业务格式演示，清单schemaVersion及sdkVersion仍为1。无受管数据时清单填dataStores:[]。

## SDK：检查、读取、修改、显式迁移

```js
import {createJSONStore} from '@ksf/sdk/storage';
const storeFor = context => createJSONStore(context, {
  name:'state.json', scope:'user', schemaVersion:2,
  initial:{total:0}, validate:d=>Number.isSafeInteger(d.total),
  migrations:{1:old=>({total:old.count})}
});
export async function prepareData(context) {
  const store=storeFor(context);
  await store.migrate();
}
export function activate(context) {
  const store=storeFor(context);
  return {async call(method) {
    if(method==='read')return store.read();
    if(method==='increment') {
      const current=await store.read();
      return store.update(d=>({total:d.total+1}),{revision:current.revision});
    }
  }};
}
```

- inspect()只检查，返回missing/current/migration-required/unsupported及etag、现有/目标版本。缺文件不创建目录或文件。
- read()只读；缺文件返回initial、revision0，不落盘；不在读取时自动迁移。格式不符时报错。
- update()在锁内读取、校验并以原etag提交；schema不符拒绝覆盖，revision不符报APP_DATA_CONFLICT。
- migrate()只在prepareData中显式调用。按明确来源版本选函数，转换克隆后的data并校验；成功后revision加1。已是目标版本或缺文件返回changed:false。转换函数只变换数据，不发送消息、启动任务或操作外部业务。

## 普通 JSON 的宿主迁移

```js
export async function prepareData(context) {
  const state=await context.storage.inspect('records.json',{scope:'runtime'});
  if(state.state==='missing'||state.state==='current')return;
  const original=await context.storage.read('records.json',{scope:'runtime'});
  const old=JSON.parse(original.text);
  const next={schemaVersion:2,items:old.records};
  if(!Array.isArray(next.items))throw Error('records校验失败');
  await context.storage.migrate('records.json',{
    scope:'runtime',text:JSON.stringify(next),ifMatch:original.etag,
    fromVersion:1,toVersion:2
  });
}
```

清单必须声明records.json的相同范围、目标版本与来源。宿主用真实调用应用和已安装包核验声明；不接受参数伪造身份。返回新etag、fromVersion、toVersion、migrationId、backupRef。普通write只允许声明的当前格式，不能用于绕过迁移。

## 原件保护及失败恢复

每个文件执行读取转换、候选校验、锁内重读、原件副本持久保存、暂存文件同步、原子替换、读回校验。副本写入失败、etag变化或未登记来源均不提交。Windows替换遇短暂共享冲突有限重试，始终不先删除正式文件。

原件位于相同范围的 `applications/migrations/<appId>/<migrationId>/before.json`，旁边migration.json记录来源/目标版本、前后摘要、包摘要及prepared/committed状态，不自动清理。迁移后响应丢失或中断时先inspect正式文件；已达目标则跳过。prepared记录不证明正式文件尚未替换，必须核对现状。不要盲目复制旧副本覆盖新工作。

多文件依次迁移，部分成功不自动倒退；应用在全部就绪前不接收业务。副本只服务于文件迁移恢复，不等于完整备份。SQLite、外部数据库、多文件事务和业务降级由应用负责。

## 升级、回退与离线诊断

`ksf app data inspect <appId> --json` 不启动服务或应用、不创建文件，按已安装清单检查。安装预览显示最低Core、数据格式与迁移需求。升级等窗口、真实调用、后台任务和文件操作排空后，再次核对并切换。

回退只切应用包，目标必须满足Core/SDK/平台条件且直接读取现有数据。schema不符拒绝回退；不自动恢复副本或降级数据。Core在独立data-compatibility.json中持有自己的唯一持久格式契约，升级与回退同时检查目标Core及所有已安装应用的要求。

工作区文档继续用workspace服务读写；共享文件/Git资源使用context.locks.run，不把应用存储锁当业务幂等或跨文件事务。
