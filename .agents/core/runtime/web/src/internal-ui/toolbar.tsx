import {useLayoutEffect,useRef,useState,type HTMLAttributes,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {ChevronsRight,Ellipsis} from 'lucide-react';
import {Button} from './controls';
import {InlineAlert} from './feedback';
import {DropdownMenu,type MenuItem} from './menus';
import {useUI,uiRootAttributes,uiRootStyle} from './provider';
import {toolbarLayout} from '../../../../applications/sdk/src/window-toolbar-model';
import {afterOverlayCommit} from '../../../../applications/sdk/src/controllers/overlay-commit';
import {stableIds} from './composition-model';

export interface ToolbarCommand {id:string;label:string;icon?:ReactNode;priority?:number;disabled?:boolean;disabledReason?:string;busy?:boolean;pressed?:boolean;badge?:string|number;commandId?:string}
export interface ToolbarProps extends Omit<HTMLAttributes<HTMLDivElement>,'onChange'>{commands:readonly ToolbarCommand[];onAction?:(id:string)=>unknown|Promise<unknown>;label:string;variant?:'page'|'inline'|'window';navigation?:ReactNode}
/** Presentation/intent only. Shortcut labels and invocations use actual host registrations. */
export function Toolbar({commands,onAction,label,variant='page',navigation,className='',...props}:ToolbarProps){
 const ui=useUI(),registry=ui.environment.commands,root=useRef<HTMLDivElement>(null),nav=useRef<HTMLDivElement>(null),measureRoot=useRef<HTMLDivElement>(null),latest=useRef(commands),ownedFocus=useRef(false),focusedCommand=useRef<string|null>(null);latest.current=commands;
 const [measure,setMeasure]=useState({width:0,navigation:0,widths:{} as Record<string,number>,overflowWidth:66}),[open,setOpen]=useState(false),[error,setError]=useState(''),[,redraw]=useState(0);stableIds(commands,command=>command.id);
 useLayoutEffect(()=>registry?.subscribe(()=>redraw(n=>n+1)),[registry]);
 useLayoutEffect(()=>{const node=root.current;if(!node)return;let frame=0;const update=()=>{frame=0;const widths=Object.fromEntries([...measureRoot.current?.querySelectorAll<HTMLElement>('[data-measure-command]')??[]].map(x=>[x.dataset.measureCommand!,x.getBoundingClientRect().width+8]));const next={width:node.clientWidth,navigation:nav.current?.scrollWidth??0,widths,overflowWidth:(measureRoot.current?.querySelector<HTMLElement>('[data-measure-more]')?.getBoundingClientRect().width??58)+8};setMeasure(prior=>JSON.stringify(prior)===JSON.stringify(next)?prior:next);};const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};update();const ro=new ResizeObserver(schedule);ro.observe(node);if(nav.current)ro.observe(nav.current);for(const child of measureRoot.current?.children??[])ro.observe(child);return()=>{ro.disconnect();if(frame)cancelAnimationFrame(frame);};},[commands,variant,ui.resolved.density,ui.variables?.['--ksf-font-body']]);
 useLayoutEffect(()=>{if(!ui.environment.active||!ui.environment.enabled||!ui.environment.visible)setOpen(false);},[ui.environment.active,ui.environment.enabled,ui.environment.visible]);
 const descriptor=(command:ToolbarCommand)=>command.commandId?registry?.describe(command.commandId):undefined;
 const blocked=(command:ToolbarCommand)=>!!(command.disabled||command.busy||command.commandId&&(!descriptor(command)?.enabled||descriptor(command)?.busy));
 const invoke=async(id:string,fromMenu=false)=>{const opening=latest.current.find(x=>x.id===id);if(!opening||blocked(opening)||!ui.environment.active||!ui.environment.enabled)return;
  if(fromMenu){setOpen(false);await afterOverlayCommit();}const current=latest.current.find(x=>x.id===id);if(!current||blocked(current))return;setError('');
  try{if(opening.commandId){const result=await registry?.invoke(opening.commandId);if(result?.status==='failed')setError(result.error);else if(!result||result.status==='unavailable')setError('此操作当前不可用。');}else await onAction?.(id);}catch(issue){setError(issue instanceof Error?issue.message:String(issue));}
 };
 const layout=toolbarLayout(commands,measure.width,measure.navigation,{widths:measure.widths,overflowWidth:measure.overflowWidth}),overflow=commands.filter(x=>layout.overflow.includes(x.id));
 const placement=JSON.stringify([layout.visible,layout.overflow]);
 useLayoutEffect(()=>{const node=root.current;if(variant!=='window'||!node||!ownedFocus.current||!ui.environment.active||!ui.environment.enabled)return;const active=node.ownerDocument.activeElement;if(!open&&active&&node.contains(active))return;if(open)setOpen(false);
  const target=[...node.querySelectorAll<HTMLButtonElement>('.ksf-toolbar-actions>button')].find(button=>button.dataset.toolbarCommand===focusedCommand.current&&!button.disabled)??node.querySelector<HTMLButtonElement>('button[aria-label="更多应用操作"]')??node.querySelector<HTMLButtonElement>('.ksf-toolbar-actions>button:not(:disabled)');target?.focus({preventScroll:true});
 },[placement,variant,ui.environment.active,ui.environment.enabled]);
 const menuItems:MenuItem[]=overflow.map(command=>({id:command.id,label:command.label,icon:command.icon,description:descriptor(command)?.displayShortcut,disabled:blocked(command)||!command.commandId&&!onAction,disabledReason:command.disabledReason??(command.commandId&&!descriptor(command)?'命令尚未注册':undefined),busy:command.busy||descriptor(command)?.busy,checked:command.pressed}));
 const content=<div {...props} ref={root} data-ksf-component="toolbar" data-variant={variant} className={className}
  onFocusCapture={event=>{props.onFocusCapture?.(event);ownedFocus.current=true;focusedCommand.current=(event.target as Element).closest<HTMLButtonElement>('button')?.dataset.toolbarCommand??null;}}
  onBlurCapture={event=>{props.onBlurCapture?.(event);if(event.relatedTarget&&!root.current?.contains(event.relatedTarget as Node))ownedFocus.current=false;}}>
  <div className="ksf-toolbar-content" role="toolbar" aria-label={label}>{navigation!=null&&<div ref={nav} className="ksf-toolbar-navigation">{navigation}</div>}<div className="ksf-toolbar-actions">{commands.filter(command=>layout.visible.includes(command.id)).map(command=><Button key={command.id} data-toolbar-command={command.id} aria-label={command.label} icon={command.icon} disabled={blocked(command)||!command.commandId&&!onAction} disabledReason={command.disabledReason??(command.commandId&&!descriptor(command)?'命令尚未注册':undefined)} busy={command.busy||descriptor(command)?.busy} aria-pressed={command.pressed} aria-keyshortcuts={descriptor(command)?.shortcut} title={descriptor(command)?.displayShortcut} onActivate={()=>void invoke(command.id)}>{command.label}{command.badge!==undefined&&<small className="ksf-toolbar-badge">{command.badge}</small>}</Button>)}{!!overflow.length&&<DropdownMenu open={open} onOpenChange={setOpen} label={label+'：更多'} trigger={<Button icon={variant==='window'?<Ellipsis/>:<ChevronsRight/>} aria-label="更多应用操作">更多</Button>} items={menuItems} onAction={id=>void invoke(id,true)}/>}</div></div>
  <div ref={measureRoot} className="ksf-toolbar-measure" aria-hidden="true">{commands.map(command=><span key={command.id} data-measure-command={command.id} className="ksf-toolbar-measure-command">{command.icon&&<span className="ksf-control-icon">{command.icon}</span>}<span>{command.label}</span>{command.badge!==undefined&&<small className="ksf-toolbar-badge">{command.badge}</small>}</span>)}<span data-measure-more="" className="ksf-toolbar-measure-command"><span className="ksf-control-icon">{variant==='window'?<Ellipsis/>:<ChevronsRight/>}</span><span>更多</span></span></div>
  {error&&<InlineAlert tone="danger" title="操作未完成" onDismiss={()=>setError('')}>{error}</InlineAlert>}
 </div>;
 if(variant!=='window')return content;if(!ui.environment.toolbarHost)throw Error('窗口Toolbar需要宿主提供toolbarHost。');return createPortal(<div {...uiRootAttributes(ui)} style={uiRootStyle(ui)} className="ksf-ui-root ksf-toolbar-window-root">{content}</div>,ui.environment.toolbarHost);
}
