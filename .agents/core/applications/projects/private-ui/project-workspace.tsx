import {useLayoutEffect,useRef,useState,type HTMLAttributes,type ReactNode,type Ref} from 'react';
import {ArrowLeft,ArrowRight} from 'lucide-react';
import {Button} from './controls';
import {PageLayout,SplitPane} from './layouts';
import {ContentState,type ContentLoadState} from './collections';
import {InlineAlert} from './feedback';
import {useUI} from './provider';
import {useComposedRef} from './refs';
export interface ProjectWorkspaceProps extends Omit<HTMLAttributes<HTMLDivElement>,'title'> {
 title?:ReactNode;description?:ReactNode;list:ReactNode;detail:ReactNode;
 listToolbar?:ReactNode;detailToolbar?:ReactNode;detailTitle?:ReactNode;
 selected:boolean;pane:'list'|'detail';onPaneChange:(pane:'list'|'detail')=>void;
 listState?:ContentLoadState;listStale?:boolean;listMessage?:ReactNode;onRetryList?:()=>void;
 detailState?:ContentLoadState;detailStale?:boolean;detailMessage?:ReactNode;onRetryDetail?:()=>void;
 selectionNotice?:ReactNode;splitSize:number;onSplitSizeChange:(size:number)=>void;
 layout?:'auto'|'wide'|'narrow';onLayoutChange?:(layout:'wide'|'narrow')=>void;
 listRef?:Ref<HTMLDivElement>;detailRef?:Ref<HTMLDivElement>;
 onListScroll?:HTMLAttributes<HTMLDivElement>['onScroll'];onDetailScroll?:HTMLAttributes<HTMLDivElement>['onScroll'];
}
/** Two independently loaded panes. Selection identity, filtering, queries and recovery belong to the application. */
export function ProjectWorkspace({title='项目',description,list,detail,listToolbar,detailToolbar,detailTitle='项目详情',selected,pane,onPaneChange,listState='ready',listStale=false,listMessage,onRetryList,detailState='ready',detailStale=false,detailMessage,onRetryDetail,selectionNotice,splitSize,onSplitSizeChange,layout='auto',onLayoutChange,listRef,detailRef,onListScroll,onDetailScroll,className='',...props}:ProjectWorkspaceProps){
 const ui=useUI(),root=useRef<HTMLDivElement>(null),listScroll=useRef<HTMLDivElement>(null),detailScroll=useRef<HTMLDivElement>(null),lastFocus=useRef<HTMLElement|null>(null),lastPane=useRef(pane),[measuredNarrow,setMeasuredNarrow]=useState(false),layoutCallback=useRef(onLayoutChange);layoutCallback.current=onLayoutChange;
 const bindList=useComposedRef(listScroll,listRef),bindDetail=useComposedRef(detailScroll,detailRef),narrow=layout==='narrow'||layout==='auto'&&measuredNarrow,visiblePane=selected?pane:'list';
 useLayoutEffect(()=>{if(layout!=='auto'||!root.current)return;const node=root.current,measure=()=>setMeasuredNarrow(node.getBoundingClientRect().width<960);measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();},[layout]);
 useLayoutEffect(()=>{layoutCallback.current?.(narrow?'narrow':'wide');},[narrow]);
 useLayoutEffect(()=>{if(!ui.environment.active||!ui.environment.enabled||!ui.environment.visible)return;const changed=lastPane.current!==visiblePane;lastPane.current=visiblePane;const frame=requestAnimationFrame(()=>{
  const page=root.current,last=lastFocus.current,active=document.activeElement;if(!page||page.closest('[inert]'))return;
  const hidden=last&&(last.closest('[hidden]')||!last.isConnected||!last.getClientRects().length);
  if(narrow&&(changed||hidden)&&(active===document.body||active===last&&hidden))(visiblePane==='detail'?detailScroll:listScroll).current?.focus({preventScroll:true});
 });return()=>cancelAnimationFrame(frame);},[narrow,visiblePane,ui.environment.active,ui.environment.enabled,ui.environment.visible]);
 const listPane=<PageLayout title={title} description={description} bodyLabel="项目目录" toolbar={<>{listToolbar}{narrow&&selected&&<Button variant="ghost" icon={<ArrowRight/>} onActivate={()=>onPaneChange('detail')}>查看选中项目</Button>}</>}><div ref={bindList} className="ksf-project-list-scroll" tabIndex={-1} onScroll={onListScroll}><ContentState state={listState} stale={listStale} description={listMessage} onRetry={onRetryList}>{list}</ContentState></div></PageLayout>;
 const detailPane=<PageLayout title={detailTitle} bodyLabel="项目详情" toolbar={<>{narrow&&<Button variant="ghost" icon={<ArrowLeft/>} aria-label="返回项目列表" onActivate={()=>onPaneChange('list')}>项目列表</Button>}{detailToolbar}</>}><div ref={bindDetail} className="ksf-project-detail-scroll" tabIndex={-1} onScroll={onDetailScroll}>{selectionNotice&&<InlineAlert title="当前选择已保留" description={selectionNotice}/>}<ContentState state={selected?detailState:'empty'} stale={detailStale} title={!selected?'选择一个项目':undefined} description={!selected?'从目录选择项目后查看详情。':detailMessage} onRetry={selected?onRetryDetail:undefined}>{selected?detail:null}</ContentState></div></PageLayout>;
 return <div {...props} ref={root} data-ksf-component="project-workspace" data-layout={narrow?'narrow':'wide'} data-pane={visiblePane} onFocusCapture={event=>{lastFocus.current=event.target as HTMLElement;props.onFocusCapture?.(event);}} className={`ksf-project-workspace ${className}`.trim()}><SplitPane label="项目目录与详情分栏" first={listPane} second={detailPane} size={splitSize} onSizeChange={onSplitSizeChange} minFirstSize={240} minSecondSize={420} collapsed={narrow?visiblePane==='detail'?'first':'second':null}/></div>;
}
