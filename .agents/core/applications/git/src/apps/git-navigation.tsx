import { useEffect, useRef, useState } from 'react';
import { Archive, ChevronRight, FileText, GitBranch, History, MoreHorizontal, Plus, Search, Tag } from 'lucide-react';
import type { GitRefs, GitRef } from './git-model';
import type { GitNode } from './git-history';
import type { Ask } from './git-refs';
import { dateTime } from './git-ui';
import { useContextMenu, copyText, type ContextAction } from '@ksf/sdk/components/ui/context-menu';
function refActions(branch:GitRef,busy:boolean,ask:Ask,browse:(rev:string)=>void,history:(ref?:string,oid?:string)=>void):ContextAction[] {
  const actions:ContextAction[]=[{id:'history',label:'浏览历史',onAction:()=>history(branch.fullName,branch.oid)}];
  if(branch.kind==='local'&&!branch.current)actions.push({id:'switch',label:'切换到此分支',disabled:busy,onAction:()=>ask('branch-switch',undefined,{name:branch.name,expectedOid:branch.oid})});
  if(branch.kind==='remote')actions.push({id:'track',label:'检出为本地分支',disabled:busy,onAction:()=>ask('branch-track',undefined,{source:branch.fullName,expectedOid:branch.oid,name:branch.name.slice(branch.name.indexOf('/')+1)})});
  actions.push({id:'browse',label:'浏览此版本文件',onAction:()=>browse(branch.oid)},{id:'create',label:'从此处新建分支',disabled:busy,onAction:()=>ask('branch-create',undefined,{startPoint:branch.fullName,expectedOid:branch.oid})});
  if(!branch.current)actions.push({id:'merge',label:'合并到当前分支',disabled:busy,onAction:()=>ask('merge',undefined,{name:branch.fullName,expectedOid:branch.oid})});
  actions.push({id:'copy',label:'复制引用名称',separator:true,onAction:()=>copyText(branch.name)},{id:'sha',label:'复制提交 SHA',onAction:()=>copyText(branch.oid)});
  if(branch.kind==='local'){
    actions.push({id:'rename',label:'重命名分支',disabled:busy,separator:true,onAction:()=>ask('branch-rename',undefined,{name:branch.name,newName:branch.name,expectedOid:branch.oid})});
    if(!branch.current)actions.push({id:'delete',label:'删除已合并分支…',danger:true,disabled:busy,onAction:()=>ask('branch-delete',undefined,{name:branch.name,expectedOid:branch.oid})});
  }
  return actions;
}
function RefActions({actions,name}:{actions:ContextAction[];name:string}) {
  return <details className="git-ref-menu"><summary aria-label={`${name} 的更多操作`}><MoreHorizontal size={14}/></summary><div>{actions.map(action=><button key={action.id} disabled={action.disabled} className={action.danger?'git-danger':''} onClick={()=>void action.onAction()}>{action.label}</button>)}</div></details>;
}
export function GitNavigation({refs,error,node,scope,changed,busy,select,history,ask,browse}:{refs:GitRefs|null;error:string|null;node:GitNode;scope:string;changed:number;busy:boolean;select:(node:GitNode)=>void;history:(ref?:string,oid?:string)=>void;ask:Ask;browse:(rev:string)=>void}) {
  const contextMenu=useContextMenu();
  const root=useRef<HTMLElement>(null),[filter,setFilter]=useState(''),[limit,setLimit]=useState(100);
  useEffect(()=>setLimit(100),[filter]);
  useEffect(()=>{const outside=(event:PointerEvent)=>{for(const menu of root.current?.querySelectorAll<HTMLDetailsElement>('.git-ref-menu[open]')??[])if(!menu.contains(event.target as Node))menu.open=false;};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[]);
  return <nav ref={root} className="git-navigation" aria-label="仓库导航" onClickCapture={event=>{const menu=(event.target as Element).closest('.git-ref-menu button')?.closest('details');if(menu){menu.open=false;menu.querySelector('summary')?.focus();}}} onKeyDown={event=>{if(event.key==='Escape'){const menu=root.current?.querySelector<HTMLDetailsElement>('.git-ref-menu[open]');if(menu){event.preventDefault();event.stopPropagation();menu.open=false;menu.querySelector('summary')?.focus();}}}}>
    <div className="git-navigation-primary"><button aria-current={node.kind==='worktree'?'page':undefined} onClick={()=>select({kind:'worktree'})}><FileText size={16}/>文件状态<small>{changed}</small></button><button aria-current={node.kind==='commit'&&!scope?'page':undefined} onClick={()=>history()}><History size={16}/>历史</button></div>
    <label className="app-search"><Search size={13}/><input aria-label="筛选引用与贮藏" placeholder="筛选引用与贮藏" value={filter} onChange={event=>setFilter(event.target.value)}/></label>
    {error&&<p className="app-error">{error}</p>}
    {(['local','tag','remote'] as const).map(kind=>{const branches=refs?.branches.filter(branch=>branch.kind===kind&&`${branch.name} ${branch.subject}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))??[],Icon=kind==='tag'?Tag:GitBranch;return <details open key={kind} className="git-navigation-group"><summary><Icon size={14}/>{kind==='local'?'分支':kind==='tag'?'标签':'远端分支'}<small>{branches.length}</small></summary>{branches.slice(0,limit).map(branch=><div key={branch.fullName} {...contextMenu.bind(()=>refActions(branch,busy,ask,browse,history),`${branch.name} 引用操作`)} className={`git-nav-ref ${scope===branch.fullName?'selected':''}`}><button title={`${branch.name}\n${branch.subject}`} aria-current={scope===branch.fullName?'page':undefined} onClick={()=>history(branch.fullName,branch.oid)}><span className={`git-current-dot ${branch.current?'is-current':''}`}/><span>{branch.name}</span>{branch.current&&<small>HEAD</small>}</button><RefActions name={branch.name} actions={refActions(branch,busy,ask,browse,history)}/></div>)}{branches.length>limit&&<button className="app-text-button" onClick={()=>setLimit(value=>value+100)}>再显示 100 项</button>}{!branches.length&&<p className="git-group-empty">{filter?'无匹配项':'暂无'}</p>}</details>;})}
    <details open className="git-navigation-group"><summary><Archive size={14}/>已贮藏<small>{refs?.stashes.length??0}</small></summary>{refs?.stashes.filter(stash=>`${stash.subject} ${stash.ref}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).slice(0,limit).map(stash=><button {...contextMenu.bind(()=>[{id:'view',label:'查看贮藏内容',onAction:()=>select({kind:'stash',oid:stash.oid})},...(['apply','pop','drop'] as const).map(action=>({id:action,label:action==='apply'?'应用并保留…':action==='pop'?'应用并删除…':'删除贮藏…',disabled:busy,danger:action==='drop',onAction:()=>ask('stash-'+action,undefined,{stash:stash.ref,stashOid:stash.oid,subject:stash.subject})})),{id:'copy',label:'复制贮藏 SHA',separator:true,onAction:()=>copyText(stash.oid)}],`${stash.ref} 贮藏操作`)} className="git-nav-stash" key={stash.oid} aria-current={node.kind==='stash'&&node.oid===stash.oid?'page':undefined} title={`${stash.subject}\n${dateTime(stash.at)}`} onClick={()=>select({kind:'stash',oid:stash.oid})}><Archive size={13}/><span><strong>{stash.subject}</strong><small>{stash.ref}</small></span><ChevronRight size={12}/></button>)}{(refs?.stashes.length??0)>limit&&<button className="app-text-button" onClick={()=>setLimit(value=>value+100)}>再显示 100 项</button>}{!refs?.stashes.length&&<p className="git-group-empty">暂无贮藏</p>}</details>
    <button className="git-nav-create" disabled={busy} onClick={()=>ask('branch-create')}><Plus size={13}/>新建分支</button>
    {contextMenu.menu}
  </nav>;
}
