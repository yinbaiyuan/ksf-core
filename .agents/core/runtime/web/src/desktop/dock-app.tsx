import {useDockTooltip} from './dock-tooltip';
import {useHostTheme} from '../components/host-theme';
import {useEffect,useLayoutEffect,useId,useRef,useState,type KeyboardEvent,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {useIsPresent} from 'motion/react';
import {ArrowUpRight,ChevronLeft,ChevronRight,Pin,PinOff,X} from 'lucide-react';

type MenuPosition={left:number;top:number};
type SubPosition=MenuPosition&{stacked:boolean;compact:boolean;dense:boolean};
type Props={appId:string;name:string;count:number;pinned:boolean;dragging:boolean;settling:boolean;move:(direction:-1|1)=>void;active:boolean;icon:ReactNode;onOpen:()=>void;onPin:()=>void;onClose?:()=>void;windowActions?:ReactNode};
export function DockApp({appId,name,count,pinned,dragging,settling,move,active,icon,onOpen,onPin,onClose,windowActions}:Props){
  const theme=useHostTheme(),present=useIsPresent();
  const trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),subTrigger=useRef<HTMLButtonElement>(null),subMenu=useRef<HTMLDivElement>(null),focusSub=useRef(false);
  const subCloseTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const id=useId(),[position,setPosition]=useState<MenuPosition|null>(null),[subOpen,setSubOpen]=useState(false),[subPosition,setSubPosition]=useState<SubPosition>({left:8,top:8,stacked:false,compact:false,dense:false});
  const tip=useDockTooltip(trigger,name,!!position||dragging||settling||!present),tooltipId=tip.id,tooltipVisible=tip.visible;
  const dismiss=(focus=false)=>{clearTimeout(subCloseTimer.current);setPosition(null);setSubOpen(false);if(focus)trigger.current?.focus({preventScroll:true});};
  const closeSub=(focus=false)=>{clearTimeout(subCloseTimer.current);setSubOpen(false);if(focus)requestAnimationFrame(()=>subTrigger.current?.focus({preventScroll:true}));};
  const openSub=(focus=false)=>{
    clearTimeout(subCloseTimer.current);
    focusSub.current=focus;
    if(subOpen){if(focus)subMenu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus({preventScroll:true});return;}
    setSubPosition({left:8,top:8,stacked:false,compact:false,dense:false});setSubOpen(true);
  };
  const showTooltip=tip.show;
  const showMenu=()=>{tip.hide();setSubOpen(false);setPosition({left:8,top:8});};
  useLayoutEffect(()=>{if(dragging||!present){tip.hide();dismiss();if(!present&&document.activeElement===trigger.current)trigger.current?.closest('.taskbar-center')?.querySelector<HTMLButtonElement>(':scope > button')?.focus({preventScroll:true});}},[dragging,present]);
  useEffect(()=>()=>clearTimeout(subCloseTimer.current),[]);
  useLayoutEffect(()=>{
    if(!position)return;const node=menu.current;if(!node)return;
    const update=()=>{const bounds=trigger.current?.getBoundingClientRect();if(!bounds)return;const box=node.getBoundingClientRect(),left=Math.max(8,Math.min(bounds.left+bounds.width/2-box.width/2,innerWidth-box.width-8)),top=Math.max(8,Math.min(bounds.top-box.height-8,innerHeight-box.height-8));setPosition(value=>!value||value.left===left&&value.top===top?value:{left,top});};
    update();const observer=new ResizeObserver(update);observer.observe(node);return()=>observer.disconnect();
  },[!!position]);
  useLayoutEffect(()=>{
    if(!subOpen)return;const node=subMenu.current;if(!node)return;
    const update=()=>{
      const parent=menu.current?.getBoundingClientRect(),anchor=subTrigger.current?.getBoundingClientRect();if(!parent||!anchor)return;
      const box=node.getBoundingClientRect();
      setSubPosition(value=>{
        if(box.height>innerHeight-16&&!value.compact)return{...value,compact:true};
        if(box.height>innerHeight-16&&value.compact&&!value.dense)return{...value,dense:true};
        const right=parent.right+4,leftSide=parent.left-box.width-4,stacked=right+box.width>innerWidth-8&&leftSide<8;
        const left=stacked?Math.max(8,Math.min(parent.left,innerWidth-box.width-8)):right+box.width<=innerWidth-8?right:leftSide;
        const top=Math.max(8,Math.min(anchor.top,innerHeight-box.height-8));
        return value.left===left&&value.top===top&&value.stacked===stacked?value:{...value,left,top,stacked};
      });
    };
    update();const observer=new ResizeObserver(update);observer.observe(node);
    if(focusSub.current){focusSub.current=false;node.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus({preventScroll:true});}
    return()=>observer.disconnect();
  },[subOpen,position?.left,position?.top,subPosition.compact,subPosition.dense]);
  useLayoutEffect(()=>{if(subOpen&&subPosition.stacked&&menu.current?.contains(document.activeElement))subMenu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus({preventScroll:true});},[subOpen,subPosition.stacked]);
  useEffect(()=>{
    if(!position)return;
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({preventScroll:true});
    const outside=(event:PointerEvent)=>{const target=event.target as Node;if(!menu.current?.contains(target)&&!subMenu.current?.contains(target)&&!trigger.current?.contains(target))dismiss();};
    const close=()=>dismiss();document.addEventListener('pointerdown',outside);window.addEventListener('resize',close);window.addEventListener('blur',close);
    return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',close);window.removeEventListener('blur',close);};
  },[!!position]);
  const menuKey=(event:KeyboardEvent<HTMLDivElement>,secondary=false)=>{
    if(event.key==='Escape'||secondary&&event.key==='ArrowLeft'){event.preventDefault();event.stopPropagation();if(secondary)closeSub(true);else dismiss(true);return;}
    if(event.key==='Tab'){dismiss(true);return;}
    if(!secondary&&event.key==='ArrowRight'&&document.activeElement===subTrigger.current){event.preventDefault();openSub(true);return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],index=items.indexOf(document.activeElement as HTMLButtonElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    if(!secondary&&items[next]!==subTrigger.current)closeSub();items[next]?.focus({preventScroll:true});
  };
  const mainAction=(action:()=>void)=>{dismiss(true);action();};
  const hoverMain=(node:HTMLButtonElement)=>{node.focus({preventScroll:true});clearTimeout(subCloseTimer.current);if(subOpen)subCloseTimer.current=setTimeout(()=>closeSub(),180);};
  const hoverSub=(node:HTMLButtonElement)=>{
    clearTimeout(subCloseTimer.current);node.focus({preventScroll:true});const box=menu.current?.getBoundingClientRect();
    // A stacked panel replaces its trigger, so enter it on click rather than hover.
    if(box&&(box.right+484<=innerWidth-8||box.left-484>=8))openSub();
  };
  return <>
    <button ref={trigger} tabIndex={present?undefined:-1} data-dock-app={appId} data-dock-pinned={pinned} className={'dock-item'+(active?' is-active':'')+(dragging?' is-dragging':'')+(settling?' is-settling':'')} aria-current={active?'true':undefined} aria-label={`${name}，${count?count+' 个窗口':'未运行'}${pinned?'，已固定到 Dock':''}`} aria-description={pinned?'拖拽排序；Alt 加左右方向键也可调整固定顺序':undefined} aria-describedby={tooltipVisible?tooltipId:undefined} aria-haspopup="menu" aria-expanded={!!position} aria-controls={position?id:undefined}
      onClick={()=>{tip.hide();dismiss();onOpen();}} onPointerDown={()=>tip.hide()} onPointerEnter={showTooltip} onPointerLeave={()=>tip.hide()} onFocus={showTooltip} onBlur={()=>tip.hide()}
      onContextMenu={event=>{event.preventDefault();showMenu();}} onKeyDown={event=>{if(event.key==='Escape'&&tooltipVisible){event.preventDefault();event.stopPropagation();tip.hide();return;}if(pinned&&event.altKey&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();tip.hide();move(event.key==='ArrowLeft'?-1:1);return;}if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){event.preventDefault();showMenu();}}}>
      {icon}{count>0&&<span className="dock-running" aria-hidden="true"/>}
    </button>
    {tip.node}
    {position&&createPortal(<div ref={menu} id={id} className={`dock-context-menu dock-app-menu dock-main-menu host-surface ${theme}`} role="menu" aria-label={`${name}Dock 操作`} aria-hidden={subOpen&&subPosition.stacked?true:undefined} style={{...position,visibility:subOpen&&subPosition.stacked?'hidden':undefined}} onKeyDown={event=>menuKey(event)} onContextMenu={event=>event.preventDefault()}>
      <h3>{name}<span>{count?count+' 个窗口':'未运行'}{pinned?' · 已固定':''}</span></h3>
      <button role="menuitem" onPointerEnter={event=>hoverMain(event.currentTarget)} onClick={()=>mainAction(onOpen)}><ArrowUpRight size={15}/>打开</button>
      <button role="menuitem" onPointerEnter={event=>hoverMain(event.currentTarget)} onClick={()=>mainAction(onPin)}>{pinned?<PinOff size={15}/>:<Pin size={15}/>} {pinned?'从 Dock 取消固定':'固定到 Dock'}</button>
      {windowActions&&<button ref={subTrigger} role="menuitem" aria-haspopup="menu" aria-expanded={subOpen} aria-controls={subOpen?id+'-windows':undefined} onPointerEnter={event=>hoverSub(event.currentTarget)} onClick={()=>openSub(true)}><span>窗口操作</span><ChevronRight size={15} className="dock-submenu-chevron"/></button>}
      {onClose&&<button role="menuitem" onPointerEnter={event=>hoverMain(event.currentTarget)} onClick={()=>mainAction(onClose)}><X size={15}/>关闭窗口</button>}
    </div>,document.body)}
    {position&&subOpen&&windowActions&&createPortal(<div ref={subMenu} id={id+'-windows'} className={`dock-context-menu dock-app-menu dock-window-submenu host-surface ${theme}${subPosition.compact?' is-compact':''}${subPosition.dense?' is-dense':''}`} role="menu" aria-label={`${name}窗口操作`} style={{left:subPosition.left,top:subPosition.top}} onKeyDown={event=>menuKey(event,true)} onContextMenu={event=>event.preventDefault()} onPointerEnter={()=>clearTimeout(subCloseTimer.current)} onPointerMove={event=>(event.target as Element).closest<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true})} onClick={event=>{if((event.target as Element).closest('[role="menuitem"]'))dismiss(true);}}>
      <h3>{subPosition.stacked&&<button type="button" className="dock-submenu-back" aria-label="返回主菜单" onClick={()=>closeSub(true)}><ChevronLeft size={14}/></button>}<span>窗口操作</span></h3>{windowActions}
    </div>,document.body)}
  </>;
}

export function DockWindowList({items}:{items:{id:string;content:ReactNode;select:()=>void}[]}){
  const [page,setPage]=useState(0),root=useRef<HTMLDivElement>(null),size=innerHeight<400?1:innerHeight<640?3:6;
  const pages=Math.ceil(items.length/size),current=Math.min(page,Math.max(0,pages-1)),start=current*size;
  const turn=(next:number)=>{setPage(next);requestAnimationFrame(()=>root.current?.querySelector<HTMLButtonElement>('[data-dock-window]')?.focus({preventScroll:true}));};
  return <div ref={root} className="dock-menu-window-list">{items.slice(start,start+size).map(item=><button role="menuitem" data-dock-window={item.id} key={item.id} onClick={item.select}>{item.content}</button>)}
    {pages>1&&<div className="dock-window-pagination" role="group" aria-label="窗口列表分页"><button type="button" disabled={!current} aria-label="上一组窗口" onClick={event=>{event.stopPropagation();turn(current-1);}}>上一组</button><span>{start+1}–{Math.min(start+size,items.length)} / {items.length}</span><button type="button" disabled={current===pages-1} aria-label="下一组窗口" onClick={event=>{event.stopPropagation();turn(current+1);}}>下一组</button></div>}
  </div>;
}
