import {AppIcon} from '../internal-ui/desktop';
import {useRef} from 'react';
import {X} from 'lucide-react';
import {LayeredApplicationIcon} from './glass-icons/layered-application-icon';
import type {ApplicationManifest} from '../apps/application-model';

export function ApplicationShortcut({appId,name,manifest,enabled,editing,open,remove,editKey}:{appId:string;name:string;manifest?:ApplicationManifest;enabled:boolean;editing:boolean;open:()=>void;remove:()=>void;editKey:(event:React.KeyboardEvent)=>void}){
 const pointer=useRef<{x:number;y:number}|null>(null),moved=useRef(false);
 return <><div className="desktop-application widget-drag-handle"
  onPointerDown={event=>{pointer.current={x:event.clientX,y:event.clientY};moved.current=false;}}
  onPointerMove={event=>{if(pointer.current&&Math.hypot(event.clientX-pointer.current.x,event.clientY-pointer.current.y)>5)moved.current=true;}}
  onPointerUp={()=>{pointer.current=null;}} onPointerCancel={()=>{pointer.current=null;moved.current=true;}}>
  <AppIcon className="application-shortcut-launch" appId={appId} label={editing?`用方向键移动${name}`:`打开${name}`} showLabel={false} visual={<LayeredApplicationIcon appId={appId} manifest={manifest}/>} activation="single" disabled={!editing&&!enabled} tabIndex={editing||enabled?0:-1} title={editing?'方向键移动':enabled?name:`${name} · 已停用`}
   onOpenIntent={()=>{if(!editing&&enabled&&!moved.current)open();}} onKeyDown={event=>{if(editing)editKey(event);}}/>

  {editing&&<div className="widget-edit-tools"><button aria-label={`移除${name}图标`} onClick={remove}><X size={14}/></button></div>}
 </div><div className="widget-caption widget-drag-handle" title={name+(!enabled?' · 已停用':'')}><span>{name}{!enabled&&' · 已停用'}</span></div></>;
}
