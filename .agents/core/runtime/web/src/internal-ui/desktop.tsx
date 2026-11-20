import {useId,type ComponentProps,type ReactNode,type Ref} from 'react';
import {X,Minus,Plus,ArrowLeft,ArrowRight,ArrowUp,ArrowDown} from 'lucide-react';
import {Button,Input} from './controls';
import {Badge,InlineAlert} from './feedback';
import {Popover,type UIOpenChange} from './overlays';
import {ContentState} from './collections';
import {useUI} from './provider';
import {stableIds} from './composition-model';

type DivProps=ComponentProps<'div'>;
/** Visual slot only. GPU/vendor effects and preference persistence stay in the host. */
export interface DesktopBackdropProps extends DivProps {paused?:boolean;fallbackColor?:string}
export function DesktopBackdrop({paused=false,fallbackColor,children,style,...props}:DesktopBackdropProps){
 const ui=useUI();return <div {...props} data-ksf-component="desktop-backdrop" data-effects={ui.resolved.animate&&!paused?'active':'paused'} aria-hidden="true" style={{...style,...(fallbackColor?{backgroundColor:fallbackColor}:{})}}>{children}</div>;
}

export interface DesktopAreaProps extends ComponentProps<'main'> {editing?:boolean;saving?:boolean;error?:ReactNode;label:string}
/** Receives an already computed layout. Neither grid compaction nor CAS writes live here. */
export function DesktopArea({editing=false,saving=false,error,label,children,...props}:DesktopAreaProps){
 useUI();return <main {...props} data-ksf-component="desktop-area" data-editing={editing} aria-label={label} aria-busy={saving||undefined}>{error&&<InlineAlert tone="danger" title="布局尚未同步">{error}</InlineAlert>}{children}</main>;
}

export interface AppIconProps extends Omit<DivProps,'onSelect'|'onContextMenu'> {
 appId:string;label:string;visual:ReactNode;surface?:'desktop'|'launcher'|'taskbar';selected?:boolean;runningCount?:number;
 showLabel?:boolean;disabled?:boolean;unavailableReason?:string;activation?:'single'|'double';onSelectIntent?:()=>void;onOpenIntent:()=>void;
 onContextIntent?:(event:React.MouseEvent<HTMLDivElement>|React.KeyboardEvent<HTMLDivElement>)=>void;
}
/** Selection and launch are separate. The supplied running count never infers a process from visibility. */
export function AppIcon({appId,label,visual,surface='desktop',selected=false,runningCount,showLabel=true,disabled=false,unavailableReason,activation=surface==='desktop'?'double':'single',onSelectIntent,onOpenIntent,onContextIntent,onClick,onDoubleClick,onKeyDown,children,...props}:AppIconProps){
 useUI();const activate=()=>{if(!disabled)onOpenIntent();};
 return <div {...props} role="button" tabIndex={disabled?-1:0} data-ksf-component="app-icon" data-app-id={appId} data-surface={surface} data-selected={selected} aria-label={label} aria-disabled={disabled||undefined} aria-description={unavailableReason} title={props.title??unavailableReason??label}
  onClick={event=>{onClick?.(event);if(!event.defaultPrevented&&!disabled){onSelectIntent?.();if(activation==='single')activate();}}}
  onDoubleClick={event=>{onDoubleClick?.(event);if(!event.defaultPrevented&&activation==='double')activate();}}
  onKeyDown={event=>{onKeyDown?.(event);if(event.defaultPrevented||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;if(event.key==='Enter'){event.preventDefault();activate();}else if(event.key===' '){event.preventDefault();if(!disabled){onSelectIntent?.();if(activation==='single')activate();}}else if((event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')&&onContextIntent){event.preventDefault();onContextIntent(event);}}}
  onContextMenu={event=>{if(onContextIntent){event.preventDefault();onContextIntent(event);}}}>
  <span className="ksf-app-icon-visual" aria-hidden="true">{visual}</span>{showLabel&&<span className="ksf-app-icon-label">{label}</span>}{runningCount!==undefined&&runningCount>0&&<span className="ksf-app-icon-running" aria-label={`${runningCount} 个窗口`}>{runningCount}</span>}{children}
 </div>;
}

export type WidgetGeometryIntent={kind:'move';dx:number;dy:number}|{kind:'resize';dw:number;dh:number};
export interface WidgetFrameProps extends DivProps {
 label:string;editing?:boolean;active?:boolean;loading?:boolean;error?:ReactNode;appearance?:ReactNode;tools?:ReactNode;
 onGeometryIntent?:(intent:WidgetGeometryIntent)=>void;onConfigureIntent?:()=>void;onRemoveIntent?:()=>void;
}
export function WidgetFrame({label,editing=false,active=false,loading=false,error,appearance,tools,onGeometryIntent,onConfigureIntent,onRemoveIntent,children,onKeyDown,...props}:WidgetFrameProps){
 useUI();return <div {...props} data-ksf-component="widget-frame" data-active={active} data-editing={editing} aria-label={props['aria-label']??label} aria-busy={loading||undefined}
  onKeyDown={event=>{onKeyDown?.(event);if(event.defaultPrevented||event.target!==event.currentTarget||!editing||!onGeometryIntent||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;const delta=({ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}as Record<string,number[]>)[event.key];if(delta){event.preventDefault();onGeometryIntent(event.shiftKey?{kind:'resize',dw:delta[0],dh:delta[1]}:{kind:'move',dx:delta[0],dy:delta[1]});}}}>
  {appearance}{error?<InlineAlert title="卡片暂不可用" tone="danger">{error}</InlineAlert>:children}
  {editing&&(tools??<div className="ksf-widget-tools" aria-label={label+'布局操作'}>{onGeometryIntent&&<>{[[ArrowLeft,-1,0,'左移'],[ArrowRight,1,0,'右移'],[ArrowUp,0,-1,'上移'],[ArrowDown,0,1,'下移']].map(([Icon,dx,dy,text])=>{const Glyph=Icon as typeof ArrowLeft;return <Button key={String(text)} icon={<Glyph/>} aria-label={String(text)+label} onActivate={()=>onGeometryIntent({kind:'move',dx:Number(dx),dy:Number(dy)})}/>;})}<Button onActivate={()=>onGeometryIntent({kind:'resize',dw:1,dh:0})}>加宽</Button><Button onActivate={()=>onGeometryIntent({kind:'resize',dw:-1,dh:0})}>收窄</Button><Button onActivate={()=>onGeometryIntent({kind:'resize',dw:0,dh:1})}>增高</Button><Button onActivate={()=>onGeometryIntent({kind:'resize',dw:0,dh:-1})}>降低</Button></>}{onConfigureIntent&&<Button onActivate={onConfigureIntent}>配置</Button>}{onRemoveIntent&&<Button onActivate={onRemoveIntent}>移除</Button>}</div>)}
 </div>;
}

export interface TopBarProps extends ComponentProps<'header'>{leading?:ReactNode;trailing?:ReactNode;label?:string}
export function TopBar({leading,trailing,children,label='工作台顶栏',...props}:TopBarProps){useUI();return <header {...props} data-ksf-component="top-bar" aria-label={label}>{leading}{children}{trailing}</header>;}

export interface DesktopApplicationView {id:string;label:string;visual:ReactNode;pinned?:boolean;windowIds:readonly string[];active?:boolean;available?:boolean;unavailableReason?:string}
export interface TaskbarProps extends ComponentProps<'nav'> {applications?:readonly DesktopApplicationView[];onLaunchIntent?:(id:string)=>void;onActivateIntent?:(windowId:string)=>void;leading?:ReactNode;trailing?:ReactNode}
export function Taskbar({applications=[],onLaunchIntent,onActivateIntent,leading,trailing,children,...props}:TaskbarProps){
 useUI();stableIds(applications,item=>item.id);return <nav {...props} data-ksf-component="taskbar" aria-label={props['aria-label']??'桌面任务栏'}>{leading}{children??applications.map(item=><AppIcon key={item.id} appId={item.id} label={item.label} visual={item.visual} surface="taskbar" selected={item.active} runningCount={item.windowIds.length} disabled={item.available===false} unavailableReason={item.unavailableReason} onOpenIntent={()=>item.windowIds.length?onActivateIntent?.(item.windowIds[0]):onLaunchIntent?.(item.id)}/>)}{trailing}</nav>;
}

export interface AppLauncherProps extends Omit<DivProps,'onChange'> {
 open:boolean;onOpenChange:UIOpenChange;anchor?:HTMLElement|null;label?:string;query?:string;onQueryChange?:(query:string)=>void;
 applications?:readonly DesktopApplicationView[];onLaunchIntent?:(id:string)=>void;loading?:boolean;error?:ReactNode;presentation?:'popover'|'inline';
}
export function AppLauncher({open,onOpenChange,anchor,label='所有应用',query='',onQueryChange,applications=[],onLaunchIntent,loading=false,error,presentation='popover',children,...props}:AppLauncherProps){
 useUI();stableIds(applications,item=>item.id);if(!open)return null;
 const content=<div {...props} data-ksf-component="app-launcher" aria-label={label}>{onQueryChange&&<Input type="search" aria-label="查找应用" value={query} onValueChange={onQueryChange} clearable/>}{children??<ContentState state={loading?'loading':error?'error':applications.length?'ready':'empty'} title={error?'应用暂不可用':applications.length?'已安装应用':'没有匹配的应用'} description={error}><div className="ksf-launcher-grid">{applications.map(item=><AppIcon key={item.id} appId={item.id} label={item.label} visual={item.visual} surface="launcher" disabled={item.available===false} unavailableReason={item.unavailableReason} onOpenIntent={()=>onLaunchIntent?.(item.id)}/>)}</div></ContentState>}</div>;
 return presentation==='inline'?content:<Popover open onOpenChange={onOpenChange} anchor={anchor} label={label} placement="top-start">{content}</Popover>;
}

export interface WindowFrameProps extends DivProps {
 windowId:string;label:string;active:boolean;maximized?:boolean;minimized?:boolean;interaction?:'idle'|'moving'|'resizing';closePending?:boolean;closeError?:ReactNode;
 onActivateIntent?:()=>void;onCloseIntent:()=>void;onMinimizeIntent:()=>void;onMaximizeIntent:()=>void;
 appearance?:ReactNode;headerRef?:Ref<HTMLElement>;toolbarRef?:Ref<HTMLDivElement>;contentRef?:Ref<HTMLDivElement>;overlayRef?:Ref<HTMLDivElement>;
 headerClassName?:string;headerStyle?:React.CSSProperties;controlsClassName?:string;toolbarClassName?:string;contentClassName?:string;overlayClassName?:string;bodyClassName?:string;auxiliary?:ReactNode;
}
/** Controlled chrome. Geometry, drag/resize, stacking and close negotiation remain host operations. */
export function WindowFrame({windowId,label,active,maximized=false,minimized=false,interaction='idle',closePending=false,closeError,onActivateIntent,onCloseIntent,onMinimizeIntent,onMaximizeIntent,appearance,headerRef,toolbarRef,contentRef,overlayRef,headerClassName='',headerStyle,controlsClassName='',toolbarClassName='',contentClassName='',overlayClassName='',bodyClassName='',auxiliary,children,onPointerDownCapture,onFocusCapture,...props}:WindowFrameProps){
 useUI();return <div {...props} role="region" aria-label={label} data-ksf-component="window-frame" data-window-id={windowId} data-surface-owner={windowId} data-surface-kind="window" data-active={active} data-maximized={maximized} data-minimized={minimized} data-interaction={interaction} data-close-pending={closePending}
  onPointerDownCapture={event=>{onPointerDownCapture?.(event);if(!event.defaultPrevented)onActivateIntent?.();}} onFocusCapture={event=>{onFocusCapture?.(event);if(!event.defaultPrevented)onActivateIntent?.();}}>
  <header ref={headerRef} className={`ksf-window-heading ${headerClassName}`.trim()} style={headerStyle}>{appearance}<div className={`ksf-window-controls ${controlsClassName}`.trim()}><button type="button" className="light-close" disabled={closePending} aria-label={closePending?'正在协商关闭':'关闭窗口'} onClick={onCloseIntent}><X size={15}/></button><button type="button" className="light-min" aria-label="最小化窗口" onClick={onMinimizeIntent}><Minus size={15}/></button><button type="button" className="light-max" aria-label={maximized?'还原窗口':'最大化窗口'} onClick={onMaximizeIntent}><Plus size={15}/></button></div><div ref={toolbarRef} className={`ksf-window-toolbar-host ${toolbarClassName}`.trim()}/></header>
  {closePending&&<div className="window-close-feedback" role="status">正在检查保存与恢复记录…</div>}{closeError&&<div className="window-close-feedback is-error" role="alert">无法关闭：{closeError}</div>}
  <div className={`ksf-window-body ${bodyClassName}`.trim()}><div ref={contentRef} className={`ksf-window-content ${contentClassName}`.trim()}>{children}</div><div ref={overlayRef} className={`ksf-window-overlays ${overlayClassName}`.trim()} data-app-overlay-root={windowId}/></div>{auxiliary}
 </div>;
}

export interface DesktopNotificationView {id:string;title:string;description?:ReactNode;read?:boolean;createdAt?:string;actions?:readonly {id:string;label:string;disabled?:boolean;reason?:string}[]}
export interface NotificationCenterProps extends DivProps {records:readonly DesktopNotificationView[];loading?:boolean;error?:ReactNode;onOpenIntent?:(id:string)=>void;onMarkReadIntent?:(id:string)=>void;onDismissIntent?:(id:string)=>void;onActionIntent?:(id:string,action:string)=>void;showHeading?:boolean}
export function NotificationCenter({records,loading=false,error,onOpenIntent,onMarkReadIntent,onDismissIntent,onActionIntent,children,showHeading=true,...props}:NotificationCenterProps){
 useUI();const heading=useId();stableIds(records,item=>item.id);return <section {...props} data-ksf-component="notification-center" aria-labelledby={heading}><h2 id={heading} className={showHeading?undefined:'ksf-visually-hidden'}>通知</h2>{children??<ContentState state={loading?'loading':error?'error':records.length?'ready':'empty'} title={error?'通知暂不可用':'暂无通知'} description={error}><ul className="ksf-notification-list">{records.map(item=><li key={item.id}><div><h3>{item.title}</h3>{item.read===false&&<Badge tone="info">未读</Badge>}</div>{item.description&&<p>{item.description}</p>}{item.createdAt&&<time>{item.createdAt}</time>}<div className="ksf-notification-actions">{onOpenIntent&&<Button onActivate={()=>onOpenIntent(item.id)}>打开</Button>}{item.read===false&&onMarkReadIntent&&<Button onActivate={()=>onMarkReadIntent(item.id)}>标为已读</Button>}{item.actions?.map(action=><Button key={action.id} disabled={action.disabled} disabledReason={action.reason} onActivate={()=>onActionIntent?.(item.id,action.id)}>{action.label}</Button>)}{onDismissIntent&&<Button onActivate={()=>onDismissIntent(item.id)}>移除通知</Button>}</div></li>)}</ul></ContentState>}</section>;
}
