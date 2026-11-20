import {useEffect,useRef,useState,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import {BookOpen,Briefcase,ChevronDown,Code2,Home,LayoutGrid,Star} from 'lucide-react';
import type {DesktopGroup,GroupIcon} from '../desktop-model';
import {useHostTheme} from '../components/host-theme';
import {useMaterial} from '../components/material-provider';
import {GradientButtonGroup} from '../components/gradient-button-group';

export const groupIconComponents={home:Home,grid:LayoutGrid,briefcase:Briefcase,book:BookOpen,star:Star,code:Code2};
export const groupIconNames:Record<GroupIcon,string>={home:'主页',grid:'网格',briefcase:'工作',book:'阅读',star:'收藏',code:'代码'};
export function DesktopSidebar({groups,activeId,select}:{groups:DesktopGroup[];activeId:string;select:(id:string)=>void}) {
  const {settings}=useMaterial();
  const theme=useHostTheme(),trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
  const [tip,setTip]=useState<{name:string;left:number;bottom:number}|null>(null),[menuBottom,setMenuBottom]=useState<number|null>(null);
  const active=groups.find(group=>group.id===activeId)??groups[0],Icon=groupIconComponents[active.icon];
  const dismiss=(focus=false)=>{setMenuBottom(null);if(focus)trigger.current?.focus({preventScroll:true});};
  useEffect(()=>{
    if(menuBottom===null)return;
    menu.current?.querySelector<HTMLButtonElement>('[aria-checked=true]')?.focus({preventScroll:true});
    const outside=(event:PointerEvent)=>{if(!menu.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))dismiss();};
    const resize=()=>{dismiss();setTip(null);};
    document.addEventListener('pointerdown',outside);window.addEventListener('resize',resize);
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',resize);};
  },[menuBottom]);
  useEffect(()=>{const hide=()=>setTip(null);window.addEventListener('resize',hide);window.addEventListener('scroll',hide,true);return()=>{window.removeEventListener('resize',hide);window.removeEventListener('scroll',hide,true);};},[]);
  const show=(node:HTMLElement,name:string)=>{const box=node.getBoundingClientRect(),half=Math.min(260,innerWidth-16)/2;setTip({name,left:Math.max(half+8,Math.min(box.left+box.width/2,innerWidth-half-8)),bottom:innerHeight-box.top+10});};
  const key=(event:KeyboardEvent<HTMLDivElement>,vertical=false)=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismiss(true);return;}
    if(event.key==='Tab'&&vertical){dismiss();return;}
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    event.preventDefault();const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')],index=items.indexOf(event.target as HTMLButtonElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(['ArrowRight','ArrowDown'].includes(event.key)?1:-1)+items.length)%items.length;
    items[next]?.focus({preventScroll:true});items[next]?.scrollIntoView({block:'nearest',inline:'nearest'});
  };
  const choose=(action:()=>void)=>{dismiss(true);setTip(null);action();};
  return <aside className="desktop-sidebar" aria-label="桌面分组导航">
    <button ref={trigger} type="button" className="page-menu-trigger group-menu-trigger" aria-label={`桌面分组：${active.name}`} aria-haspopup="menu" aria-expanded={menuBottom!==null} onPointerEnter={event=>{const label=event.currentTarget.querySelector<HTMLElement>('.group-menu-label');if(label&&label.scrollWidth>label.clientWidth)show(event.currentTarget,active.name);}} onFocus={event=>{const label=event.currentTarget.querySelector<HTMLElement>('.group-menu-label');if(label&&label.scrollWidth>label.clientWidth)show(event.currentTarget,active.name);}} onPointerLeave={()=>setTip(null)} onBlur={()=>setTip(null)} onClick={()=>{setTip(null);setMenuBottom(value=>value===null?innerHeight-(trigger.current?.getBoundingClientRect().top??0)+8:null);}}><span className="group-menu-ring" aria-hidden="true"><span className="group-gradient-spin"/></span><span className="group-menu-content"><Icon size={16} aria-hidden="true"/><span className="group-menu-label">{active.name}</span><ChevronDown size={10} aria-hidden="true"/></span></button>
    <GradientButtonGroup items={groups.map(group=>{const GroupIcon=groupIconComponents[group.icon];return{id:group.id,label:group.name,icon:<GroupIcon size={16}/>};})} value={activeId} onValueChange={select} enabled={settings.motion} onHint={show} onHideHint={()=>setTip(null)}/>
    {tip&&createPortal(<span className={`sidebar-tooltip host-surface ${theme}`} role="tooltip" style={{left:tip.left,bottom:tip.bottom}}>{tip.name}</span>,document.body)}
    {menuBottom!==null&&createPortal(<div ref={menu} className={`page-group-menu dock-context-menu host-surface ${theme}`} role="menu" aria-label="桌面分组" style={{left:8,bottom:menuBottom,width:'min(300px, calc(100vw - 16px))',maxHeight:`calc(100dvh - ${menuBottom+40}px)`}} onKeyDown={event=>key(event,true)}>{groups.map(group=>{const GroupIcon=groupIconComponents[group.icon];return <button key={group.id} role="menuitemradio" aria-checked={group.id===activeId} onClick={()=>choose(()=>select(group.id))}><GroupIcon size={18} aria-hidden="true"/><span>{group.name}</span></button>;})}</div>,document.body)}
  </aside>;
}
