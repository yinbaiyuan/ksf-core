import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getSession } from '@ksf/sdk/apps/client';
export interface GitPreferences { diffMode:'hunks'|'split'|'unified'; wrap:boolean; graphRatio:number }
export const defaultGitPreferences:GitPreferences = { diffMode:'hunks', wrap:false, graphRatio:.4 };
function preferences(value:unknown):GitPreferences {
  const raw=(value && typeof value==='object'?value:{}) as Partial<GitPreferences>;
  return {diffMode:['hunks','split','unified'].includes(raw.diffMode??'')?raw.diffMode!:'hunks',wrap:raw.wrap===true,graphRatio:typeof raw.graphRatio==='number'&&Number.isFinite(raw.graphRatio)?Math.max(.2,Math.min(.7,raw.graphRatio)):.4};
}
const Context=createContext({ repoId:'standalone', value:defaultGitPreferences, error:'', update:(_value:Partial<GitPreferences>)=>{} });
export const useGitPreferences=()=>useContext(Context);
export function GitPreferencesProvider({repoId,children}:{repoId:string;children:ReactNode}) {
  const [value,setValue]=useState(defaultGitPreferences),[error,setError]=useState(''),key=useRef(''),current=useRef(value); current.current=value;
  useEffect(()=>{
    let live=true;
    const receive=(event:Event)=>{
      const change=(event as CustomEvent<{key:string;value:unknown}>).detail;
      if(change?.key===key.current)setValue(preferences(change.value));
    };
    const storage=(event:StorageEvent)=>{if(event.key===key.current)try{setValue(preferences(JSON.parse(event.newValue??'{}')));}catch{setError('显示偏好内容无效，当前设置仍保留。');}};
    window.addEventListener('ksf:git-preferences-change',receive);window.addEventListener('storage',storage);
    void getSession().then(session=>{
      if(!live)return;key.current=`ksf.git.preferences.${session.instanceId}.${repoId}`;
      try{setValue(preferences(JSON.parse(localStorage.getItem(key.current)??'{}')));}catch{setError('无法读取显示偏好，本次使用默认值。');}
    }).catch(()=>{if(live)setError('无法读取实例信息，显示偏好暂时只在当前窗口生效。');});
    return()=>{live=false;window.removeEventListener('ksf:git-preferences-change',receive);window.removeEventListener('storage',storage);};
  },[repoId]);
  const update=(next:Partial<GitPreferences>)=>{
    let base=current.current;
    try{if(key.current){const stored=localStorage.getItem(key.current);if(stored)base=preferences(JSON.parse(stored));}}catch{/* The in-memory value is still usable. */}
    const merged=preferences({...base,...next});current.current=merged;setValue(merged);
    try{if(key.current){localStorage.setItem(key.current,JSON.stringify(merged));setError('');window.dispatchEvent(new CustomEvent('ksf:git-preferences-change',{detail:{key:key.current,value:merged}}));}else setError('显示偏好暂时只在当前窗口生效。');}catch{setError('无法保存显示偏好，当前窗口仍可使用。');}
  };
  return <Context.Provider value={{repoId,value,error,update}}>{children}</Context.Provider>;
}
