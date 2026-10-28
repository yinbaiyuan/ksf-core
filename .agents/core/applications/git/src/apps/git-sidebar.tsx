import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PaneResize } from '@ksf/sdk/components/workbench-controls';
import { getSession } from '@ksf/sdk/apps/client';
import { sidebarMax, sidebarWidth } from './git-sidebar-model';
/** Persist only completed gestures; dragging updates this column without rewriting storage. */
export function GitSidebar({id,label,className,initial,max=420,reserve=480,children}:{id:string;label:string;className:string;initial:number;max?:number;reserve?:number;children:ReactNode}) {
  const root=useRef<HTMLElement>(null), key=useRef(''), touched=useRef(false), latest=useRef(initial);
  const [value,setValue]=useState(initial),[total,setTotal]=useState(1600),[error,setError]=useState('');
  const minimum=160,maximum=sidebarMax(total,reserve,minimum,max),displayed=sidebarWidth(value,initial,minimum,maximum);
  latest.current=value;
  useEffect(()=>{const parent=root.current?.parentElement;if(!parent)return;const measure=()=>setTotal(parent.clientWidth);measure();const observer=new ResizeObserver(measure);observer.observe(parent);return()=>observer.disconnect();},[]);
  useEffect(()=>{
    let live=true;
    void getSession().then(session=>{
      if(!live)return;key.current=`ksf.git.sidebar-width.${session.instanceId}.${id}`;
      try{if(touched.current)localStorage.setItem(key.current,JSON.stringify(latest.current));else setValue(sidebarWidth(JSON.parse(localStorage.getItem(key.current)??'null'),initial,minimum,max));}
      catch{setError('无法保存侧栏宽度，当前窗口仍可调整。');}
    }).catch(()=>{if(live)setError('侧栏宽度暂时只在当前窗口生效。');});
    return()=>{live=false;};
  },[id,initial,max]);
  const change=(next:number)=>{touched.current=true;latest.current=next;setValue(next);};
  const save=(next:number)=>{change(next);try{if(key.current){localStorage.setItem(key.current,JSON.stringify(next));setError('');}}catch{setError('无法保存侧栏宽度，当前窗口仍可调整。');}};
  return <aside ref={root} className={`${className} git-resizable-sidebar`} aria-label={label} style={{width:displayed}}>
    {children}<PaneResize name={label} value={displayed} min={minimum} max={maximum} defaultValue={initial} onChange={change} onCommit={save}/>
    {error&&<small className="git-sidebar-save-warning" role="status" title={error}>宽度仅本次生效</small>}
  </aside>;
}
