import type {UIConfiguration,UIStyle} from './types';
export interface FileUIOrigin {config:Partial<UIConfiguration>;style:UIStyle;trigger:HTMLElement|null}
/** Capture the caller's presentation before a lazy import. SDK identity remains authoritative. */
export function captureFileUIOrigin(owner:string):FileUIOrigin {
 const empty:FileUIOrigin={config:{},style:{},trigger:null};
 if(typeof document==='undefined'||typeof HTMLElement==='undefined'||!(document.activeElement instanceof HTMLElement))return empty;
 const trigger=document.activeElement,root=trigger.closest<HTMLElement>('.ksf-ui-root[data-ui-owner]');
 if(!root||root.dataset.uiOwner!==owner)return empty;
 const config:Partial<UIConfiguration>={};
 for(const [key,allowed] of Object.entries({theme:['light','dark'],density:['compact','comfortable'],material:['solid','frost','glass'],motion:['full','reduced']})){
  const value=root.dataset[key];if(value&&allowed.includes(value))Object.assign(config,{[key]:value});
 }
 const style=Object.fromEntries(Array.from(root.style).filter(key=>key.startsWith('--ksf-')).map(key=>[key,root.style.getPropertyValue(key)])) as UIStyle;
 return {config,style,trigger};
}
