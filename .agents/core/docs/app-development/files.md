# 通用文件（SDK API 1.2.0）

前端从 `@ksf/sdk/files` 导入 `createFileClient(sdk)`，后端使用 `createBackendFileClient(context)`。宿主绑定真实调用应用，不接受应用自行指定另一个 appId。运行协议及清单代际保持 1；新包最低 Core 0.5.7，API 1.0—1.1旧包继续兼容，不需重打包。

## 范围与版本

`FileRef = {scope:'workspace'|'user'|'runtime',path:string}`。path 是范围内的相对路径，根目录用空字符串。workspace 为实例工作区；user/runtime 分别为当前应用数据目录。绝对路径、越界、符号链接、宿主受保护内容和非普通文件均被拒绝。权限声明不构成操作系统沙箱。

`stat(ref)` 和 `list(ref)` 返回 `FileInfo`：ref、path、kind、size（字节）、modifiedAt、version、policy、writable，受保护对象另有 protection 原因。目录版本包含后代状态；超过 50,000 项的目录不可整体操作。`exists(ref)` 只将不存在转为 false，路径或权限错误仍抛出。

新建默认不覆盖。修改既有文件需提供读取时的 `ifMatch`；copy/move/trash 需来源 `version`。版本是宿主产生的不透明字符串，不自行计算、解析或长期缓存。冲突应重新读取并交由应用合并，禁止自动覆盖。`list` 中过大目录可导航，但标为不可整体操作。

## 内容与管理

- `read(ref)` 返回 `{...FileInfo,bytes:Uint8Array}`，`readText` 返回 UTF-8 text，保留 BOM 和换行。非 UTF-8 文本报错。
- `write({ref,bytes,ifMatch?,operationId?})`、`writeText({ref,text,ifMatch?,operationId?})`。通用内容上限128 MiB；文档编辑仍为8 MiB。
- 前端 `upload({ref,blob,ifMatch?,signal?,operationId?})` 使用原始 HTTP body；内容摘要在浏览器计算，宿主流式校验与暂存，不进入普通业务 RPC 或 JSON/base64。`signal` 可取消。选择外部文件取消时无需调用 upload。
- `download(ref)` 或 `await downloadURL(ref)`：保存准备后下载磁盘版本，附件响应不执行内容。
- `mkdir({ref,recursive?})`、`copy({ref,destination,version})`、`move(...)`，重命名就是 move。来源和目标范围可不同；目录不合并、目标不覆盖。移动仅同文件系统，EXDEV 明确拒绝并保留来源。移动不改写 Markdown 相对链接。

宿主同目录暂存、同步、重新核对版本后发布；新建、旧工作区保存、图片上传和应用存储共享协调锁。图片专用上传继续使用原格式、尺寸及相对链接规则。通用服务不会绕过声明的 dataStores JSON 原件与显式迁移，也继续检查项目原件、只读和登记证据。

## 回收与操作结果

`trash({ref,version})` 返回 TrashEntry；`listTrash()` 查询当前应用自有条目及共享工作区条目。实体及元数据位于实例 `.agents/runtime-data/files/trash/`，重启保留，没有定时清理。

`restore({trashId,destination?})` 默认回原路径，缺失父目录可重建；同名冲突返回错误，应另选位置。恢复不可切换原范围。`purge({trashId,confirm:true})` 永久删除；`emptyTrash({ids,confirm:true})` 仅删除用户本次确认的显式条目，返回每项结果。界面必须明确确认，不能先查询后无条件清空整个目录。

每次变更携带 operationId，SDK 默认生成。需要跨重连对账时由应用先保存 ID。成功回执也包含 ID；前端错误附带 `error.operationId`。通过 `operation(id)` 查询已提交结果或未确认状态及候选信息。请求结果未知时先核对原件、目标和回收内容，不换新 ID 盲目重放。相同 ID 不接受不同载荷；已确认操作返回原回执。未确认但摘要与持久状态吻合时可对账为 committed；其他情况保留证据供人工核对。

操作日志 schema 1 存于 `.agents/runtime-data/files/operations/<appId>/`，没有自动丢弃。服务关闭及应用版本切换会等待进行中的文件变更完成。

## 变化与交互

`watch(ref,onChange,onError?)` 返回取消方法；卸载组件时务必取消。目录共享监听，外部变化通过监听加周期校准发现。协议提供游标及最长10秒长轮询；重启、游标失效或历史缺口返回 resync，应用须重新读取。宿主事件含 create/update/delete/move；无法识别的外部重命名表现为删除和新增。

`pickFile(options)`、`pickDirectory(options)`、`pickSaveTarget(options)` 返回 FileRef 或 null，取消不写磁盘。选项含 scope、initialPath、rootPath（交互导航边界）、extensions、suggestedName、title。保存选择只选新位置，不预创建文件；冲突留在界面反馈。`manage(options)` 打开公共文件操作面板，提供导入、下载、复制/移动、建目录及回收恢复。未知格式显示属性和下载，不附带编辑器。

工作区来源在下载、复制、移动、回收前调用 `sdk.resources.prepare(path)`。应用编辑器须注册保存准备；保存冲突或失败则停止后续操作并保留草稿。收到外部变化后，干净内容可重新读取，脏内容只提示，不覆盖草稿。

## 前端示例

```tsx
import {createFileClient, type FileRef} from '@ksf/sdk/files';
const files = createFileClient(sdk);
const destination = await files.pickSaveTarget({initialPath:'项目/示例/成果',suggestedName:'附件.pdf'});
if (destination) await files.upload({ref:destination,blob:selectedBrowserFile});
const ref:FileRef = {scope:'workspace',path:'项目/示例/说明.md'};
const original = await files.readText(ref);
await files.writeText({ref,text:original.text+'\n补充',ifMatch:original.version});
const cancel = files.watch(ref,event=>{
  if (editorDirty()) showDiskChanged();
  else void reloadFromDisk();
});
// 组件卸载时 cancel()。
```

## 后端示例

```js
import {createBackendFileClient} from '@ksf/sdk/files';
export function activate(context) {
  const files = createBackendFileClient(context);
  return {async call(method) {
    if (method !== 'export') throw Error('Unknown method');
    await files.mkdir({ref:{scope:'user',path:'exports'},recursive:true});
    const ref = {scope:'user',path:'exports/report.bin'};
    await files.write({ref,bytes:new Uint8Array([0,255,80,68,70])});
    return files.stat(ref);
  }};
}
```

声明的受管 JSON 使用 storage 接口，不能用这个示例覆盖。后端字节经专用宿主服务传递，应用业务方法不得将大附件作为普通前端 RPC 返回值。
