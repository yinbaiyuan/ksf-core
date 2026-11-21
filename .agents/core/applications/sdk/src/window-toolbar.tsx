import {useSurfaceScope} from './surface-context';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Ellipsis, LoaderCircle, X, type LucideIcon } from 'lucide-react';
import { useWindowContext, type WindowObject } from './window-context';
import { toolbarLayout } from './window-toolbar-model';
import {installWindowToolbarHints} from './window-toolbar-hints';
import {overlays} from './overlay-coordinator';
import type {ApplicationCommands,ScopedCommandDefinition} from './controllers/command-registry';
import './window-toolbar.css';
export interface WindowAction {
  id: string; label: string; icon: LucideIcon; shortcut?: string; badge?: number | string;
  disabled?: boolean; busy?: boolean; pressed?: boolean; priority?: number;commandId?:string;allowEditable?:boolean;onAction: () => void;
}
export interface WindowToolbarProps { object?:WindowObject; navigation?: ReactNode; actions: WindowAction[]; label?: string }
export function WindowToolbar({ object, navigation, actions, label = '应用快捷操作' }: WindowToolbarProps) {
  const scope=useSurfaceScope(),context = useWindowContext(), host = context.toolbarHost;
  const commandPrefix='toolbar.'+useId(),latest=useRef(actions);latest.current=actions;
  const handles=useRef(new Map<string,{id:string;registration:ReturnType<ApplicationCommands['register']>}>()),managedMenu=useRef(false);
  const [,redraw]=useState(0),[feedback,setFeedback]=useState('');
  useLayoutEffect(()=>context.commands?.subscribe(()=>redraw(x=>x+1)),[context.commands]);
  useLayoutEffect(()=>()=>{for(const item of handles.current.values())item.registration.dispose();handles.current.clear();},[context.commands]);
  useLayoutEffect(()=>{
    const commands=context.commands,wanted=new Set(actions.filter(x=>x.shortcut&&!x.commandId).map(x=>x.id));
    for(const [id,item] of handles.current)if(!commands||!wanted.has(id)){item.registration.dispose();handles.current.delete(id);}
    if(!commands)return;
    for(const action of actions){if(!action.shortcut||action.commandId)continue;const id=commandPrefix+'.'+action.id;
      const definition:ScopedCommandDefinition={id,label:action.label,shortcut:action.shortcut,enabled:!action.disabled&&!action.busy,allowEditable:!!action.allowEditable,execute:action.onAction};
      try{const old=handles.current.get(action.id);if(old)old.registration.update(definition);else handles.current.set(action.id,{id,registration:commands.register(definition)});}
      catch{const old=handles.current.get(action.id);old?.registration.dispose();handles.current.delete(action.id);} // Unsupported legacy hints are omitted; the button remains usable.
    }
  },[actions,context.commands,commandPrefix]);
  const command=(action:WindowAction)=>{const id=action.commandId??handles.current.get(action.id)?.id;return id?context.commands?.describe(id):undefined;};
  const errorSignature=JSON.stringify(actions.map(x=>({label:x.label,error:command(x)?.error})).filter(x=>x.error));
  useEffect(()=>{const errors=JSON.parse(errorSignature) as {label:string;error:string}[];setFeedback(errors.length?errors.map(x=>x.label+'：'+x.error).join('；'):'');},[errorSignature]);
  useEffect(()=>{context.setObject?.(object??null);},[context.setObject,object?.title,object?.detail]);
  const root = useRef<HTMLDivElement>(null), nav = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null), measurement = useRef<HTMLDivElement>(null), ownedFocus=useRef(false), focusedAction=useRef<string|null>(null);
  const [measure, setMeasure] = useState({width:0,navigation:0,widths:{} as Record<string,number>,overflowWidth:76}), [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const node=root.current, meter=measurement.current;if(!node||!meter)return;
    let frame=0;
    const update=()=>{frame=0;const widths=Object.fromEntries([...meter.querySelectorAll<HTMLElement>('[data-measure-command]')].map(item=>[item.dataset.measureCommand!,Math.ceil(item.getBoundingClientRect().width)+4]));
      const next={width:node.clientWidth,navigation:nav.current?.childNodes.length?nav.current.scrollWidth:0,widths,overflowWidth:Math.ceil(meter.querySelector<HTMLElement>('[data-measure-more]')?.getBoundingClientRect().width??72)+4};
      setMeasure(prior=>JSON.stringify(prior)===JSON.stringify(next)?prior:next);
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
    update();const observer=new ResizeObserver(schedule);observer.observe(node);if(nav.current)observer.observe(nav.current);for(const item of meter.children)observer.observe(item);
    return()=>{observer.disconnect();if(frame)cancelAnimationFrame(frame);};
  }, [host,actions]);
  useEffect(()=>{if(!root.current||!context.active||!context.enabled)return;return installWindowToolbarHints(root.current);},[host,context.active,context.enabled]);
  const layout = toolbarLayout(actions, measure.width, measure.navigation,{widths:measure.widths,overflowWidth:measure.overflowWidth}), overflow = actions.filter(action => layout.overflow.includes(action.id));
  const placement=JSON.stringify([layout.visible,layout.overflow]);
  useLayoutEffect(()=>{
    const node=root.current;if(!node||!ownedFocus.current||!context.active||!context.enabled)return;
    const active=node.ownerDocument.activeElement;
    if(!open&&active&&node.contains(active))return;
    if(open)setOpen(false);
    const target=[...node.querySelectorAll<HTMLButtonElement>('.window-actions>button')].find(button=>button.dataset.windowAction===focusedAction.current&&!button.disabled)??trigger.current??node.querySelector<HTMLButtonElement>('.window-actions>button:not(:disabled)');
    target?.focus({preventScroll:true});
  },[placement,context.active,context.enabled]);
  const close = (focus = false) => { setOpen(false); if (focus&&context.active&&context.enabled&&trigger.current?.isConnected&&!trigger.current.closest('[inert]')) trigger.current.focus(); };
  useEffect(() => { if (!context.enabled || !context.active || !overflow.length) setOpen(false); }, [context.enabled, context.active, overflow.length]);
  useLayoutEffect(()=>{if(!open)return;const coordinator=context.overlays??overlays,registration=coordinator.isManaged?.()&&coordinator.register?.({kind:'menu',modal:false,element:()=>menu.current,trigger:trigger.current,autoFocus:false,onClose:()=>setOpen(false)});managedMenu.current=!!registration;return()=>{if(registration)registration.dispose();};},[open,context.overlays]);
  useEffect(() => {
    if (!open) return;
    if(context.active&&context.enabled)menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    if(!managedMenu.current)document.addEventListener('pointerdown', outside); return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const invoke = async(action:WindowAction)=>{const current=latest.current.find(x=>x.id===action.id);if(!current||current.disabled||current.busy)return;const descriptor=command(current);
    if(descriptor&&context.commands){const pending=context.commands.invoke(descriptor.id);close(open);const result=await pending;if(result.status==='failed')setFeedback(current.label+'：'+result.error);return;}
    close(open);
    if(current.commandId)return;
    try{await current.onAction();}catch(error){setFeedback(current.label+'：'+(error instanceof Error?error.message:String(error)));}
  };
  const content = <div ref={root} className={`ksf-sdk-surface ${scope} window-toolbar ksf-toolbar-refined ${layout.labels ? 'with-labels' : 'icons-only'}`} role="toolbar" aria-label={label}
    onFocusCapture={event=>{ownedFocus.current=true;focusedAction.current=(event.target as Element).closest<HTMLButtonElement>('button')?.dataset.windowAction??null;}}
    onBlurCapture={event=>{if(event.relatedTarget&&!root.current?.contains(event.relatedTarget as Node))ownedFocus.current=false;}}>
    <div ref={nav} className="window-navigation">{navigation}</div><div className="window-actions">
      {actions.filter(action => layout.visible.includes(action.id)).map(action => <button key={action.id} data-window-action={action.id} type="button" className="window-command" title={`${action.label}${command(action) ? `（${command(action)!.displayShortcut}）` : ''}`} aria-label={action.label} aria-keyshortcuts={command(action)?.shortcut} aria-pressed={action.pressed} disabled={action.disabled || action.busy || command(action)?.busy || !!action.commandId&&!command(action)?.enabled} aria-busy={action.busy || command(action)?.busy || undefined} onClick={() => void invoke(action)}>{action.busy || command(action)?.busy ? <LoaderCircle size={16} className="toolbar-spin" /> : <action.icon size={16} />}<span className="command-label">{action.label}</span>{action.badge !== undefined && action.badge !== 0 && <small className="command-badge">{action.badge}</small>}</button>)}
      {!!overflow.length && <div className="window-overflow"><button ref={trigger} type="button" className="window-command" aria-label="更多应用操作" title="更多应用操作" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); } }}><Ellipsis size={20} /><span className="command-label">更多</span></button>{open && <div ref={menu} className="window-command-menu" role="menu" aria-label="更多应用操作" onKeyDown={event => {
        if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
        if (event.key === 'Tab') close();
        const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]; const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : event.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); buttons[next]?.focus(); }
      }}>{overflow.map(action => <button key={action.id} data-window-action={action.id} type="button" role="menuitem" disabled={action.disabled || action.busy || command(action)?.busy || !!action.commandId&&!command(action)?.enabled} aria-busy={action.busy || command(action)?.busy || undefined} onClick={() => void invoke(action)}>{action.busy || command(action)?.busy ? <LoaderCircle size={16} className="toolbar-spin" /> : <action.icon size={16} />}<span>{action.label}</span>{action.badge !== undefined && action.badge !== 0 && <small>{action.badge}</small>}{command(action)&&<kbd>{command(action)!.displayShortcut}</kbd>}</button>)}</div>}</div>}
    </div>
    <div ref={measurement} className="window-toolbar-measure" aria-hidden="true" inert>
      {actions.map(action=><span key={action.id} data-measure-command={action.id} className="window-toolbar-measure-command"><action.icon size={20}/><span>{action.label}</span>{action.badge!==undefined&&action.badge!==0&&<small className="command-badge">{action.badge}</small>}</span>)}
      <span data-measure-more="" className="window-toolbar-measure-command"><Ellipsis size={20}/><span>更多</span></span>
    </div>
  </div>;
  const failure=feedback&&createPortal(<div className={`ksf-sdk-surface ${scope} window-command-feedback`} role="alert"><span>{feedback}</span><button type="button" aria-label="关闭操作提示" onClick={()=>setFeedback('')}><X size={14}/></button></div>,context.overlayHost??host??document.body);
  return <>{host?createPortal(content,host):context.id==='standalone'?content:null}{failure}</>;
}
