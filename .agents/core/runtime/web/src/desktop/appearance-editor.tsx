import {useEffect,useLayoutEffect,useState,useSyncExternalStore} from 'react';
import {Button,ContentState,Form,InlineAlert,SaveStatus,Surface,ContentPreview} from '../internal-ui/index';
import {appearancePreferences} from '../instance-preferences';
import {MaterialSettingsContent} from '../components/material-settings-panel';
import {useAppearancePreview} from '../components/material-provider';
import {request} from '../apps/client';
import {useSettingsDraft,settingsError} from './settings-controls';
import {configurationDifferences} from './settings-comparison';
/** The existing appearance controller remains the only configuration owner. */
export function AppearanceEditor(){
 const view=useSyncExternalStore(appearancePreferences.subscribe,appearancePreferences.getSaveSnapshot),{setPreview}=useAppearancePreview(),[previewing,setPreviewing]=useState(true),[validating,setValidating]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 useLayoutEffect(()=>{appearancePreferences.beginManual();return()=>{setPreview(null);appearancePreferences.endManual();};},[setPreview]);
 useEffect(()=>{if(!view.ready)void appearancePreferences.load();},[]);
 useEffect(()=>{setPreview(view.ready&&previewing?view.value.value:null);},[view.value,view.ready,previewing,setPreview]);
 const save=async()=>{setError('');setNotice('');await appearancePreferences.flush();const next=appearancePreferences.getSaveSnapshot();if(!next.pending&&!next.dirty&&next.status==='saved'){setNotice('外观已保存。');window.dispatchEvent(new Event('ksf:config-change'));return true;}return false;};
 const discard=async()=>{setError('');setNotice('');const discarded=await appearancePreferences.discardDraft();if(discarded)setPreviewing(false);return discarded;};
 useSettingsDraft(view.dirty||!!view.pending,view.status==='saving'||validating,discard,save,!!view.pending);
 async function check(){const version=view.draftVersion;setValidating(true);setError('');setNotice('');try{await request('/api/config/appearance',{operation:'check',ifMatch:view.committed?.revision,values:{settings:structuredClone(view.value.value)}});setNotice(appearancePreferences.getSaveSnapshot().draftVersion===version?'校验通过，尚未保存。':'上次草稿校验通过；之后的新修改尚未校验。');}catch(issue){setError(settingsError(issue,true));}finally{setValidating(false);}}
 const unavailable=!view.ready?(view.error?'error':'loading'):'ready';
 return <ContentState state={unavailable} description={view.error?.message} onRetry={()=>void appearancePreferences.load()}><Surface title="工作台外观" description="修改保留为草稿；临时预览与实例保存分别处理。"><Form noValidate validating={validating} onSubmitIntent={()=>void save()}>
  <MaterialSettingsContent manual value={view.value.value} defaults={appearancePreferences.getDefaults()} onResetAll={appearancePreferences.resetDraft} onUpdate={appearancePreferences.edit} status={view.status}/>
  <div className="settings-editor-actions"><Button onActivate={()=>setPreviewing(v=>!v)}>{previewing?'暂停预览':'预览草稿'}</Button><Button disabled={!view.dirty||!!view.pending||view.status==='saving'} onActivate={()=>void discard()}>放弃修改</Button><Button disabled={!!view.pending||view.status==='saving'} onActivate={()=>appearancePreferences.resetDraft()}>恢复默认草稿</Button><Button busy={validating} disabled={!!view.pending||view.status==='saving'} onActivate={()=>void check()}>校验</Button><Button type="submit" variant="primary" busy={view.status==='saving'} disabled={!view.dirty||validating||!!view.pending||view.status==='conflict'}>保存外观</Button></div>
  <SaveStatus variant="detailed" view={view} validating={validating} onRetry={()=>void appearancePreferences.retry()} onReconcile={()=>void appearancePreferences.reconcileSave()} onResolve={()=>setNotice('请比较下方草稿与最新实例值，再决定采用哪一份。')}/>
  {view.status==='conflict'&&view.remote&&<Surface title="比较外观版本"><ContentPreview format="structured-summary" content={{changes:configurationDifferences(view.value.value,view.remote.value.value),resetOverrides:view.value.reset}}/><div className="settings-editor-actions"><Button onActivate={()=>appearancePreferences.keepDraftOnLatest()}>保留草稿并采用最新版本</Button><Button onActivate={()=>void discard()}>采用最新实例值</Button></div></Surface>}
  {notice&&<InlineAlert title={notice}/>} {error&&<InlineAlert tone="danger" title="外观尚未保存" description={error}/>} {previewing&&view.dirty&&<InlineAlert title="正在预览未保存的外观" description="暂停预览恢复最新已提交外观，草稿仍保留。"/>}
 </Form></Surface></ContentState>;
}
