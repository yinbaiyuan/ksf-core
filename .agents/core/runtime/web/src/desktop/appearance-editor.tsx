import {useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';
import {Button} from '@ksf/sdk/button';
import {DropdownMenu} from '@ksf/sdk/dropdown-menu';
import {Form} from '@ksf/sdk/form';
import {InlineAlert} from '@ksf/sdk/inline-alert';
import {SettingsGroup} from './settings-controls';
import {SettingsSaveFeedback,SettingsLoadState,SettingsPreview} from './settings-feedback';
import {appearancePreferences} from '../instance-preferences';
import {MaterialSettingsContent} from '../components/material-settings-panel';
import {useAppearancePreview} from '../components/material-provider';
import {request} from '../apps/client';
import {useSettingsDraft,settingsError} from './settings-controls';
import {configurationDifferences} from './settings-comparison';
/** The existing appearance controller remains the only configuration owner. */
export function AppearanceEditor(){
 const form=useRef<HTMLFormElement>(null),view=useSyncExternalStore(appearancePreferences.subscribe,appearancePreferences.getSaveSnapshot),{setPreview}=useAppearancePreview(),[previewing,setPreviewing]=useState(true),[validating,setValidating]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 useLayoutEffect(()=>{appearancePreferences.beginManual();return()=>{setPreview(null);appearancePreferences.endManual();};},[setPreview]);
 useEffect(()=>{if(!view.ready)void appearancePreferences.load();},[]);
 useEffect(()=>{setPreview(view.ready&&previewing?view.value.value:null);},[view.value,view.ready,previewing,setPreview]);
 const save=async()=>{setError('');setNotice('');if(form.current&&!form.current.checkValidity()){setError('请先修正标出的数值，当前草稿已保留。');return false;}await appearancePreferences.flush();const next=appearancePreferences.getSaveSnapshot();if(!next.pending&&!next.dirty&&next.status==='saved'){setNotice('外观已保存。');window.dispatchEvent(new Event('ksf:config-change'));return true;}return false;};
 const discard=async()=>{setError('');setNotice('');const discarded=await appearancePreferences.discardDraft();if(discarded)setPreviewing(false);return discarded;};
 useSettingsDraft(view.dirty||!!view.pending,view.status==='saving'||validating,discard,save,!!view.pending);
 async function check(){const version=view.draftVersion;setValidating(true);setError('');setNotice('');try{await request('/api/config/appearance',{operation:'check',ifMatch:view.committed?.revision,values:{settings:structuredClone(view.value.value)}});setNotice(appearancePreferences.getSaveSnapshot().draftVersion===version?'校验通过，尚未保存。':'上次草稿校验通过；之后的新修改尚未校验。');}catch(issue){setError(settingsError(issue,true));}finally{setValidating(false);}}
 const unavailable=!view.ready?(view.error?'error':'loading'):'ready';
 return <SettingsLoadState state={unavailable} description={view.error?.message} onRetry={()=>void appearancePreferences.load()}><SettingsGroup title="工作台外观" description="修改保留为草稿；临时预览与实例保存分别处理。"><Form ref={form} layout="vertical" disabled={validating||view.status==='saving'} onCommit={async()=>{await save();}}>
  <MaterialSettingsContent manual value={view.value.value} defaults={appearancePreferences.getDefaults()} onResetAll={appearancePreferences.resetDraft} onUpdate={appearancePreferences.edit} status={view.status}/>
  <div className="settings-domain-footer"><div className="settings-domain-state"><SettingsSaveFeedback view={view} validating={validating} onRetry={()=>void appearancePreferences.retry()} onReconcile={()=>void appearancePreferences.reconcileSave()} onResolve={()=>setNotice('请比较下方草稿与最新实例值，再决定采用哪一份。')}/></div><div className="settings-editor-actions"><DropdownMenu variant="text" label="更多外观操作" trigger="更多操作" triggerMode="click" disabled={!!view.pending||view.status==='saving'||validating} items={[{id:'preview',label:previewing?'暂停预览':'预览草稿',onAction:()=>setPreviewing(v=>!v)},{id:'validate',label:'校验当前草稿',onAction:check},{id:'reset',label:'恢复默认草稿',onAction:()=>appearancePreferences.resetDraft()}]}/>{(view.dirty||!!view.pending)&&<><Button disabled={!view.dirty||!!view.pending||view.status==='saving'} onClick={()=>void discard()}>放弃修改</Button><Button type="submit" variant="solid" tone="primary" loading={view.status==='saving'} disabled={!view.dirty||validating||!!view.pending||view.status==='conflict'}>保存外观</Button></>}</div></div>
  {view.status==='conflict'&&view.remote&&<SettingsGroup title="比较外观版本"><SettingsPreview content={{changes:configurationDifferences(view.value.value,view.remote.value.value),resetOverrides:view.value.reset}}/><div className="settings-editor-actions"><Button onClick={()=>appearancePreferences.keepDraftOnLatest()}>保留草稿并采用最新版本</Button><Button onClick={()=>void discard()}>采用最新实例值</Button></div></SettingsGroup>}
  {notice&&<InlineAlert heading={notice}/>} {error&&<InlineAlert tone="error" heading="外观尚未保存" children={error}/>} {previewing&&view.dirty&&<InlineAlert heading="正在预览未保存的外观" children="暂停预览恢复最新已提交外观，草稿仍保留。"/>}
 </Form></SettingsGroup></SettingsLoadState>;
}
