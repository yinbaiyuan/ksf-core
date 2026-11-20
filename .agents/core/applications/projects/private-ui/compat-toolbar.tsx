import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import type {WindowAction,WindowToolbarProps} from '@ksf/sdk/window-toolbar';
import {useWindowContext} from '@ksf/sdk/window-context';
import {Toolbar} from './toolbar';
import {LegacyUIBoundary} from './compat-boundary';
import {useOptionalUI} from './provider';
import {useOptionalApplicationSDK} from './mount';
import {useSurfaceScope} from './support/surface-context';
export type {WindowAction,WindowToolbarProps};
export function WindowToolbar({object,navigation,actions,label='应用快捷操作'}:WindowToolbarProps){
 const scope=useSurfaceScope(),legacy=useWindowContext(),ui=useOptionalUI(),sdk=useOptionalApplicationSDK(),context=legacy.id==='standalone'&&ui?{...legacy,id:ui.environment.owner,active:ui.environment.active,enabled:ui.environment.enabled,toolbarHost:ui.environment.toolbarHost,overlays:ui.environment.overlays,commands:ui.environment.commands}:legacy;
 const prefix='toolbar.'+useId(),handles=useRef(new Map<string,{id:string;entry:ReturnType<NonNullable<typeof context.commands>['register']>}>()),[,redraw]=useState(0);
 useLayoutEffect(()=>context.commands?.subscribe(()=>redraw(value=>value+1)),[context.commands]);
 useLayoutEffect(()=>()=>{for(const item of handles.current.values())item.entry.dispose();handles.current.clear();},[context.commands]);
 useLayoutEffect(()=>{const wanted=new Set(actions.filter(x=>x.shortcut&&!x.commandId).map(x=>x.id));for(const [id,item]of handles.current)if(!wanted.has(id)){item.entry.dispose();handles.current.delete(id);}
  for(const action of actions){if(!action.shortcut||action.commandId||!context.commands)continue;const id=prefix+'.'+action.id,definition={id,label:action.label,shortcut:action.shortcut,enabled:!action.disabled&&!action.busy,allowEditable:!!action.allowEditable,execute:action.onAction};
   try{const old=handles.current.get(action.id);if(old)old.entry.update(definition);else handles.current.set(action.id,{id,entry:context.commands.register(definition)});}catch{handles.current.get(action.id)?.entry.dispose();handles.current.delete(action.id);}
  }
 },[actions,context.commands,prefix]);
 useEffect(()=>{if(legacy.setObject)legacy.setObject(object??null);else sdk?.setTitle(object?.title??'',object?.detail);},[legacy.setObject,sdk,object?.title,object?.detail]);
 if(!context.toolbarHost&&context.id!=='standalone')return null;
 return <LegacyUIBoundary><Toolbar className={scope+' ksf-sdk-surface'} label={label} variant={context.toolbarHost?'window':'inline'} navigation={navigation==null?undefined:<div className="ksf-compat-toolbar-navigation window-navigation">{navigation}</div>} commands={actions.map(action=>({id:action.id,label:action.label,icon:<action.icon size={16}/>,priority:action.priority,disabled:action.disabled,busy:action.busy,pressed:action.pressed,badge:action.badge,commandId:action.commandId??handles.current.get(action.id)?.id}))}
  onAction={id=>actions.find(action=>action.id===id)?.onAction()}/></LegacyUIBoundary>;
}
