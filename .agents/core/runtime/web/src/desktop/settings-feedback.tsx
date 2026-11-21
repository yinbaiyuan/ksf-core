import {lazy,Suspense,type ReactNode} from 'react';
const RichPreview=lazy(()=>import('@ksf/sdk/apps/rich-preview'));
const noImage=async()=>null;
import type {SaveView} from '@ksf/sdk/controllers';
import {SaveStatus} from '@ksf/sdk/save-status';
import {InlineAlert} from '@ksf/sdk/inline-alert';
import {EmptyState} from '@ksf/sdk/empty-state';
import {Button} from '@ksf/sdk/button';
import {SettingsActions,settingsError} from './settings-controls';

/** Present the existing controller; this component never owns or retries a mutation itself. */
export function SettingsSaveFeedback({view,validating=false,onRetry,onReconcile,onResolve}:{
 view:Pick<SaveView<unknown>,'status'|'dirty'|'pending'|'draftVersion'|'connection'|'error'|'canRetrySameAttempt'>;
 validating?:boolean;onRetry?:()=>void;onReconcile?:()=>void;onResolve?:()=>void;
}){
 if(view.status==='unknown'||view.status==='conflict')return <InlineAlert tone="warning" heading={view.status==='unknown'?'保存结果待核实':'实例配置已变化'} actions={<SettingsActions>
  {view.status==='unknown'&&onReconcile&&<Button disabled={validating} onClick={onReconcile}>核对原请求</Button>}
  {view.status==='unknown'&&view.canRetrySameAttempt&&onRetry&&<Button disabled={validating} onClick={onRetry}>重试原保存</Button>}
  {view.status==='conflict'&&onResolve&&<Button disabled={validating} onClick={onResolve}>比较版本</Button>}
 </SettingsActions>}>{(view.error?settingsError(view.error.message,true):undefined)??(view.status==='unknown'?'草稿已保留。先核对原提交，再继续编辑或离开。':'草稿已保留，请比较最新实例值后处理。')}</InlineAlert>;
 const status=validating||view.status==='saving'?'saving':view.status==='failed'?'error':view.connection==='unavailable'?'offline':view.status==='loading'||view.dirty?'editing':'saved';
 const message=validating?'正在校验草稿':view.status==='loading'?'正在读取实例设置':(view.error?settingsError(view.error.message,true):undefined)??(view.status==='saving'&&view.pending&&view.draftVersion!==view.pending.draftVersion?'当前提交完成后，仍有新修改待保存':view.dirty?'修改保留在当前页面，保存后生效':undefined);
 return <SaveStatus status={status} pendingChanges={view.dirty?1:0} message={message} onRetry={view.status==='failed'?onRetry:undefined}/>;
}
export function SettingsLoadState({state,description,onRetry,children}:{state:'loading'|'error'|'ready';description?:string;onRetry:()=>void;children:ReactNode}){
 if(state==='ready')return children;
 return <EmptyState compact illustration={false} heading={state==='loading'?'正在读取设置…':'设置暂不可用'} description={description??(state==='loading'?'请稍候。':'无法连接本地服务，请重试。')} actions={state==='error'?<Button onClick={onRetry}>重新读取</Button>:undefined}/>;
}
export function SettingsPreview({content,format}:{content:unknown;format?:'markdown'}){if(format==='markdown'&&typeof content==='string')return <section aria-label="Markdown 内容预览" tabIndex={0}><Suspense fallback={<p role="status">正在载入预览…</p>}><RichPreview text={content} path="" open={()=>{}} canOpenLocal={false} resolveImage={noImage} allowDiagrams={false}/></Suspense></section>;return <pre className="settings-code-preview">{typeof content==='string'?content:JSON.stringify(content,null,2)}</pre>;}
