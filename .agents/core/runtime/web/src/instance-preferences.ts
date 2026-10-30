import {useEffect,useSyncExternalStore,useState} from 'react';
import {ConfigurationPreferences} from './configuration-preferences';
import {request} from './apps/client';
import {DESKTOP_KEY,PREVIOUS_DESKTOP_KEY,LEGACY_DESKTOP_KEY,readDesktop,defaultDesktop} from './desktop-model';
import {MATERIAL_KEY,readMaterialSettings,defaultMaterialSettings} from './material-settings';
import {validateDesktop,validateAppearance} from '../../../applications/sdk/src/shared/preferences-validation.js';
function browserStorage(){try{return localStorage;}catch{return undefined;}}
const storage=browserStorage();
function has(keys:string[]){try{return keys.some(key=>storage?.getItem(key));}catch{return false;}}
export const desktopPreferences=new ConfigurationPreferences('desktop','preferences',defaultDesktop(),request,storage,has([DESKTOP_KEY,PREVIOUS_DESKTOP_KEY,LEGACY_DESKTOP_KEY])?readDesktop(storage):null,validateDesktop);
export const appearancePreferences=new ConfigurationPreferences('appearance','settings',defaultMaterialSettings(),request,storage,has([MATERIAL_KEY])?readMaterialSettings(storage):null,validateAppearance);
export function useInstancePreferences<T>(store:ConfigurationPreferences<T>){
 const state=useSyncExternalStore(store.subscribe,store.getSnapshot);
 useEffect(()=>{void store.load();const timer=setInterval(()=>{if(!document.hidden)void store.load();},5000);const visible=()=>{if(!document.hidden)void store.load();};document.addEventListener('visibilitychange',visible);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);};},[store]);
 return state;
}
export function preferenceStatus(status:string){return ({loading:'正在读取实例设置…',default:'使用默认设置；尚未保存实例覆盖',saving:'正在保存到实例…',saved:'已保存到当前 KSF 实例',failed:'尚未确认保存',conflict:'实例配置冲突，草稿已保留'} as Record<string,string>)[status]??status;}
export function useInstanceName(){
 const [name,setName]=useState('KSF 工作台');
 useEffect(()=>{let live=true;const load=()=>{if(document.hidden)return;void request<{values:{name?:string}}>('/api/config/instance').then(value=>{if(live)setName(value.values.name||'未命名 KSF');},()=>{});};load();const timer=setInterval(load,5000);window.addEventListener('ksf:config-change',load);return()=>{live=false;clearInterval(timer);window.removeEventListener('ksf:config-change',load);};},[]);
 return name;
}
