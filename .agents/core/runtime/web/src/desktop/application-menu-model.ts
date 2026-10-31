import {createApplicationMenuRegistry,type ApplicationMenuItem} from '../../../../applications/sdk/src/application-menu.ts';
type Action=()=>void|Promise<void>;
export function createWindowMenus(){
 const registry=createApplicationMenuRegistry(),listeners=new Set<()=>void>();
 let settings:Action|null=null,about:Action|null=null,cliDocs:Action|null=null;
 let snapshot={items:registry.getSnapshot(),settings,about,cliDocs} as {items:ApplicationMenuItem[];settings:Action|null;about:Action|null;cliDocs:Action|null};
 function changed(){snapshot={items:registry.getSnapshot(),settings,about,cliDocs};listeners.forEach(listener=>listener());}
 registry.subscribe(changed);
 return {registerMenu:registry.register,getSnapshot:()=>snapshot,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
  registerSettings(action:Action){settings=action;changed();return()=>{if(settings===action){settings=null;changed();}};},
  registerAbout(action:Action){about=action;changed();return()=>{if(about===action){about=null;changed();}};},
  registerCLIDocs(action:Action){cliDocs=action;changed();return()=>{if(cliDocs===action){cliDocs=null;changed();}};},
 };
}
export type WindowMenus=ReturnType<typeof createWindowMenus>;
export function standardApplicationMenu(name:string,hasCLI:boolean,state:ReturnType<WindowMenus['getSnapshot']>,quit:Action):ApplicationMenuItem[]{
 return [{id:'ksf.about',label:'关于 '+name,onAction:()=>state.about?.()},
  ...(hasCLI?[{id:'ksf.cli-docs',label:'CLI 文档',disabled:!state.cliDocs,onAction:()=>state.cliDocs?.()}]:[]),
  ...(state.settings?[{id:'ksf.settings',label:'设置…',onAction:()=>state.settings?.()}]:[]),
  ...state.items.filter(item=>item.placement==='application'),
  {id:'ksf.quit',label:'退出 '+name+' 应用',separator:true,onAction:quit}];
}
