# 可直接改造的接口示例

以下使用SDK 2.2.0。每个异步示例都必须显示错误，不能把catch改成静默成功。完整工程与依赖锁以开发包的apps/为准；此页解释组合方式。

## React、导航、工具栏、临时状态与关闭保护

```tsx
import {useEffect,useRef,useSyncExternalStore} from 'react';
import {Save,Info} from 'lucide-react';
import {mountReact,useApplicationSDK} from '@ksf/sdk/react';
import {useWindowState} from '@ksf/sdk/window-context';
import {WindowToolbar} from '@ksf/sdk/window-toolbar';
import {Sheet} from '@ksf/sdk/components/ui/sheet';
import type {ApplicationSDK2} from '@ksf/sdk';
function App(){
 const sdk=useApplicationSDK();
 const surface=useSyncExternalStore(sdk.subscribe,sdk.getSnapshot);
 const [text,setText]=useWindowState('draft','');
 const [details,setDetails]=useWindowState('details',false);
 const [error,setError]=useWindowState('error','');
 const dirty=useRef(false);
 useEffect(()=>sdk.onBeforeClose(()=>!dirty.current),[sdk]);
 async function save(){
  try{await sdk.call('saveDraft',{text});dirty.current=false;setError('');}
  catch(error){setError((error as Error).message);}
 }
 useEffect(()=>{
  const listener=(event:KeyboardEvent)=>{
   if(!surface.active||!surface.enabled||event.isComposing||sdk.overlays.owner())return;
   if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'){
    event.preventDefault();void save();
   }
  };
  window.addEventListener('keydown',listener);
  return()=>window.removeEventListener('keydown',listener);
 },[surface.active,surface.enabled,text]);
 return <main className="review-app">
  <WindowToolbar object={{title:'草稿'}} actions={[
   {id:'save',label:'保存',icon:Save,priority:10,onAction:()=>void save()},
   {id:'details',label:'详情',icon:Info,onAction:()=>setDetails(true)}
  ]}/>
  <textarea aria-label="草稿" value={text} onChange={e=>{setText(e.target.value);dirty.current=true}}/>
  <button onClick={()=>{setText('');dirty.current=false}}>放弃草稿</button>
  <button onClick={()=>sdk.navigate({tab:'history'})}>历史</button>
  <button onClick={()=>sdk.openApp('markdown')}>文档</button>
  {error&&<p role="alert">{error}</p>}
  <Sheet open={details} onOpenChange={setDetails} title="详情"><p>未保存时先保存或放弃，再关闭窗口。</p></Sheet>
 </main>;
}
export const mount=(container:HTMLElement,sdk:ApplicationSDK2)=>mountReact(App,container,sdk);
```

配套后端：

```js
import {createJSONStore} from '@ksf/sdk/storage';
export function activate(context){
 const store=createJSONStore(context,{initial:{text:''}});
 return {async call(method,params){
  if(method==='saveDraft'){
   if(typeof params?.text!=='string')throw Object.assign(Error('需要文本'),{code:'APP_INPUT_INVALID'});
   return store.update(()=>({text:params.text}));
  }
  throw Object.assign(Error('未知方法'),{code:'APP_METHOD_UNKNOWN'});
 }};
}
```

调用saveDraft有持久副作用。APP_CALL_TIMEOUT时不能声称保存失败，需要提供按业务编号查询的方法；这个最小示例只演示SDK组合，正式业务应增加操作幂等键。session草稿只在当前页面保留，恢复到新页面需要明确持久策略。挂载负责创建React根，dispose负责卸载及取消订阅；关闭保护里只做用户选择和保存，不把交互推迟到dispose。

## 文件读取、并发保存与移动

```ts
import {createWorkspaceClient} from '@ksf/sdk/workspace';
const files=createWorkspaceClient(sdk);
const original=await files.read('项目/演示/notes.md');
try{
 const saved=await files.save({path:original.path,version:original.version,text:editedText});
 // 从saved.version继续编辑，不复用旧版本；移动会先协调其他文档窗口保存。
 const moved=await files.move({path:saved.path,destination:'项目/演示/renamed.md',version:saved.version});
 sdk.navigate({path:moved.path});
}catch(error){
 const issue=error as Error&{code?:string;data?:{disk?:unknown}};
 // 展示issue.message；WORKSPACE_CONFLICT时保留editedText并显示issue.data.disk。
 throw issue;
}
```

read无写副作用；save成功替换原位文件，必须使用版本；move会改变路径、通知其他应用。prepare失败会阻止移动，不可catch后强行执行。图片使用upload({path:文档路径,name,base64})；不能传音频或绕过图片容量。mediaURL(path)是同源资源URL，媒体授权仍由工作台检查。

应用编辑器需用sdk.resources.register注册相关文档的保存回调，返回注销函数并在卸载时执行；只保存所请求路径影响的草稿。保存回调中不要再次调用prepare，避免递归。

## 原生DOM卡片的可见状态与独立配置

```ts
import type {ApplicationSDK2} from '@ksf/sdk';
export function mount(container:HTMLElement,sdk:ApplicationSDK2){
 let alive=true,revision=0;
 async function render(){
  const current=++revision,snapshot=sdk.getSnapshot();
  const config=sdk.configuration.get() as {schemaVersion?:number;projectId?:string}|null;
  container.textContent=config?.projectId??'尚未选择项目';
  if(!snapshot.enabled||document.hidden)return;
  try{
   const data=await sdk.call<{title:string}>('summary',{projectId:config?.projectId});
   if(alive&&current===revision)container.textContent=data.title;
  }catch(error){if(alive&&current===revision)container.textContent=(error as Error).message;}
 }
 const unsubscribe=sdk.subscribe(()=>void render());
 const visible=()=>void render();document.addEventListener('visibilitychange',visible);
 void render();
 return {dispose(){alive=false;unsubscribe();document.removeEventListener('visibilitychange',visible);container.replaceChildren()}};
}
```

configuration.set应在明确的用户设置动作中调用，如set({schemaVersion:1,projectId:'demo'})。同步失败必须保留旧值并显示APP_CARD_CONFIG_*；本例没有定时刷新或生成模型任务。需要轮询时自行加入pending防重入、错误退避和卸载清理。

## AI从接受到业务采用

```js
// 1. store内先固定businessRunId、stepId、完整请求和稳定idempotencyKey。
// 2. 仅向统一AI服务提交，保存aiTaskId；同键恢复，不换键规避冲突。
const task=await ai.submit(persistedRequest);
await store.update(data=>({...data,aiTaskId:task.aiTaskId}));
// 3. 后续窗口或后台恢复该编号，不依赖原窗口存活。
const status=await ai.get(task.aiTaskId);
if(status.status==='succeeded'){
 const result=await ai.readResult(task.aiTaskId);
 // validateBusinessResult是应用的业务验收；不能仅相信泛型T。
 validateBusinessResult(result.value);
 await store.update(data=>data.adoptedRevision===status.revision?data:{
  ...data,adoptedRevision:status.revision,acceptedResult:result.value,nextStep:'ready'
 });
}
```

上例使用外层已创建的ai和store，完整初始化见ai-task模板。持久步骤与业务运行的并发更新需用应用锁或revision控制。实际发送、发布、扣款等外部副作用必须另有稳定幂等键/回执；本地保存nextStep不能与外部系统自动组成事务。结果未知时先核对外部回执，不能因为窗口重开就再次发布。

## 后台入口

background:true、permissions含background、backend.startBackground三者配套。startBackground中恢复应用已有进度，按显式用户设置决定是否注册计时器，然后迅速返回。dispose停止计时器。每次短期工作用context.tasks.run，重要步骤落盘；日期、时区、错过的执行与补跑由应用定义。

开发包ai-task/backend.mjs提供不执行任何定时工作的可选入口。启用后台不自动等于启用业务定时。工作台退出会停止应用进程，不能承诺系统级准点任务或离线继续运行。
