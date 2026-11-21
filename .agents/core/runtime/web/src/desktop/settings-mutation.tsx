import {useEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import {SaveController,createConfigurationSaveAdapter,type ConfigurationRecord} from '@ksf/sdk/controllers';
import {Button} from '@ksf/sdk/button';
import {SettingsSaveFeedback,SettingsPreview} from './settings-feedback';
import {SettingsActions,SettingsTechnical,useSettingsDraft} from './settings-controls';
import {request} from '../apps/client';
type RecordResult=ConfigurationRecord&{application:{state:string;error?:{message:string}}};
/** Configuration writes share the existing CAS controller, including uncertain-result reconciliation. */
export function useSettingsMutation(domain:string,onAdopt?:(values:Record<string,unknown>)=>void,onConfirmed?:()=>void){
 const record=useRef<RecordResult|null>(null),adopt=useRef(onAdopt),working=useRef(false),submitted=useRef(false),confirmed=useRef(onConfirmed);adopt.current=onAdopt;confirmed.current=onConfirmed;
 const store=useMemo(()=>new SaveController(createConfigurationSaveAdapter<Record<string,unknown>>({request,domain,valueReconciliation:true,select:r=>{record.current=r as RecordResult;return {...r.defaults,...r.values};},values:v=>v}),{initial:{}}),[domain]);
 const view=useSyncExternalStore(store.subscribe,store.getSnapshot);
 useEffect(()=>{void store.refresh();},[store]);
 useEffect(()=>{if(submitted.current&&view.status==='saved'&&!view.dirty&&!view.pending){submitted.current=false;confirmed.current?.();}},[view]);
 const discard=async()=>{submitted.current=false;const done=await store.discard();if(done!==false)adopt.current?.(store.getSnapshot().value);return done;};
 useSettingsDraft(view.dirty||!!view.pending,view.status==='saving',discard,async()=>{await store.save();const v=store.getSnapshot();return v.status==='saved'&&!v.dirty&&!v.pending;},!!view.pending);
 async function submit(values:Record<string,unknown>):Promise<RecordResult|false>{
  if(working.current||store.getSnapshot().pending)return false;working.current=true;
  try{if(!store.getSnapshot().committed)await store.refresh();if(!store.getSnapshot().committed)return false;submitted.current=true;store.update(values);await store.save();const v=store.getSnapshot();return v.status==='saved'&&!v.dirty&&!v.pending?record.current??false:false;}finally{working.current=false;}
 }
 const feedback=(view.dirty||view.pending||view.status==='failed'||view.status==='conflict')?<><SettingsSaveFeedback view={view} onRetry={()=>void store.retry()} onReconcile={()=>void store.reconcile()}/>{view.status==='conflict'&&view.remote&&<SettingsTechnical title="比较提交草稿与最新配置"><SettingsPreview content={{draft:view.value,latest:view.remote.value}}/><SettingsActions><Button onClick={()=>store.merge(view.value)}>保留草稿并采用最新版本</Button><Button onClick={()=>void discard()}>采用最新实例值</Button></SettingsActions></SettingsTechnical>}</>:null;
 return {submit,feedback,blocked:!!view.pending||view.status==='saving',store};
}
