import {ChevronDown,Monitor,Moon,PanelLeft,Sun} from 'lucide-react';
import {lazy,Suspense,useLayoutEffect,useState} from 'react';
import type {ApplicationSDK} from '@ksf/sdk/application-sdk';
import {mountReact} from '@ksf/sdk/react';
import {WindowToolbar} from '@ksf/sdk/window-toolbar';
import {Button} from '@ksf/sdk/button';
import {DropdownMenu} from '@ksf/sdk/dropdown-menu';
import {ToggleGroup} from '@ksf/sdk/toggle-group';
import {View} from '@ksf/sdk/view';
import {AppLayout} from '@ksf/sdk/app-layout';
import {ScrollArea} from '@ksf/sdk/scroll-area';
import {SplitView} from '@ksf/sdk/split-view';
import {Drawer} from '@ksf/sdk/drawer';
import {Skeleton} from '@ksf/sdk/skeleton';
import {Text,InlineCode} from '@ksf/sdk/typography';
import {CatalogPage} from './catalog-page';
import {CatalogNavigation} from './catalog-navigation';
import {useLibraryController} from './library-controller';
import './style.css';
import './detail.css';
import './preview.css';
const ComponentDetail=lazy(()=>import('./component-detail').then(m=>({default:m.ComponentDetail})));
function ComponentLibrary({search,navigate}:{search:URLSearchParams;navigate:ApplicationSDK['navigate']}){
 const c=useLibraryController(search,navigate),item=c.route.item;
 const [directoryVisible,setDirectoryVisible]=useState(true);
 const directoryShown=c.narrow?c.directoryOpen:directoryVisible;
 const [toolbar,setToolbar]=useState<HTMLDivElement|null>(null),[toolbarMode,setToolbarMode]=useState<'full'|'compact'|'tight'>('full');
 useLayoutEffect(()=>{if(!toolbar)return;let frame=0,previous:string|undefined;
  const measure=()=>{const next=toolbar.clientWidth<280?'tight':toolbar.clientWidth<470?'compact':'full';if(next===previous)return;previous=next;const restore=toolbar.querySelector('.library-theme-controls')?.contains(toolbar.ownerDocument.activeElement);setToolbarMode(next);
   if(restore){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>toolbar.querySelector<HTMLElement>('.library-theme-controls input:checked,.library-theme-controls button')?.focus({preventScroll:true}));}};
  measure();const observer=new ResizeObserver(measure);observer.observe(toolbar);return()=>{observer.disconnect();cancelAnimationFrame(frame);};
 },[toolbar]);
 const themes=[{value:'system',label:'跟随系统',icon:Monitor},{value:'light',label:'浅色',icon:Sun},{value:'dark',label:'深色',icon:Moon}] as const,currentTheme=themes.find(theme=>theme.value===(c.theme??'system'))!;
 const selectTheme=(value:string)=>c.setTheme(value==='system'?undefined:value as 'light'|'dark');
 return <div ref={c.root} className="component-library-shell"><View theme={c.theme} className="component-library" style={{height:'100%'}}>
  <WindowToolbar label="组件库工具栏" actions={[]} navigation={<div ref={setToolbar} className="library-window-controls">
   <Button className="library-directory-command window-command" variant="text" wave={false} icon={<PanelLeft/>} aria-label={directoryShown?'收起组件目录':'显示组件目录'} aria-pressed={directoryShown} onClick={()=>c.narrow?c.setDirectoryOpen(v=>!v):setDirectoryVisible(v=>!v)}>目录</Button>
   <span className="library-window-location" hidden={toolbarMode==='tight'}>{item?.label??'全部组件'}</span>
   <div className="library-theme-controls">
    {toolbarMode!=='full'?<DropdownMenu label={'外观：'+currentTheme.label} placement="bottom-end" triggerMode="click" trigger={<><currentTheme.icon/><span>{toolbarMode==='tight'?(currentTheme.value==='system'?'系统':currentTheme.label):'外观：'+currentTheme.label}</span><ChevronDown className="library-theme-chevron" style={{width:14,height:14}}/></>} triggerProps={{className:'window-command library-theme-command',variant:'text',wave:false}} items={themes.map(theme=>({id:theme.value,label:theme.label,icon:<theme.icon/>,checked:currentTheme.value===theme.value,onAction:()=>selectTheme(theme.value)}))}/>
    :<ToggleGroup label="外观模式" value={c.theme??'system'} onValueChange={selectTheme} options={themes.map(theme=>({value:theme.value,label:theme.label,icon:<theme.icon/>}))}/>}
   </div>
  </div>}/>
  <AppLayout className="library-layout">
   <SplitView className={`library-split${c.narrow?' is-narrow':''}`} sizes={[c.sidebarWidth,Math.max(1,c.width-c.sidebarWidth)]} defaultSizes={[260,Math.max(1,c.width-260)]} onSizesChange={c.resizeSidebar} collapsed={c.narrow||!directoryVisible?['directory']:[]} collapseButtons="hidden" panels={[
    {id:'directory',label:'组件目录',minSize:240,maxSize:420,collapsible:true,content:<aside className="library-sidebar" aria-label="组件目录"><CatalogNavigation controller={c}/></aside>},
    {id:'content',label:'组件展示',minSize:360,content:<ScrollArea ref={c.content} label="组件库正文" className="component-library-content library-scroll-area">
    {item?<Suspense fallback={<div role="status" aria-label="加载组件详情"><Skeleton active rows={4}/></div>}><ComponentDetail key={item.id} item={item} tab={c.route.tab} onTab={c.setTab} exampleId={c.route.exampleId} onExample={c.setExample} onShowUsage={c.showUsage} theme={c.theme} scrollContainer={c.content} onOverview={c.overview} onGroup={c.selectGroup}/></Suspense>:<CatalogPage controller={c}/>}
    <footer className="component-library-footer"><InlineCode>{item?.available?.entry??item?.id??'KSF 组件与模式目录'}</InlineCode><Text size="caption" tone="muted">全库 {c.inventory.available} 项已具备 · {c.inventory.examples} 个示例</Text></footer>
   </ScrollArea>},
   ]}/>
  </AppLayout>
  <Drawer className="library-directory-drawer" ref={c.drawer} open={c.narrow&&c.directoryOpen} title="组件目录" side="start" size={320} footer={false} keepMounted onClose={()=>c.setDirectoryOpen(false)}><CatalogNavigation controller={c} showHeading={false}/></Drawer>
 </View></div>;
}
export function mount(container:HTMLElement,sdk:ApplicationSDK){container.classList.add('component-library-mount');const view=mountReact(ComponentLibrary,container,sdk);return {dispose(){view.dispose();container.classList.remove('component-library-mount');}};}
