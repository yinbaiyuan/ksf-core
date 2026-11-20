import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {ApplicationSDK} from '@ksf/sdk/application-sdk';
import type {ViewTheme} from '@ksf/sdk/view';
import {useWindowContext} from '@ksf/sdk/window-context';
import {searchComponentRecords,componentContracts} from '@ksf/sdk/component-catalog';
import {catalogItems,componentGroups,type CatalogItem} from './catalog';
import {emptyFilters,hasLibraryFilters,readLibraryRoute,type DetailTab,type LibraryFilters} from './library-model';
import {observeLibraryScrollbars} from './library-scrollbar';
export function useLibraryController(search:URLSearchParams,navigate:ApplicationSDK['navigate']){
 const route=readLibraryRoute(search,catalogItems,componentGroups),context=useWindowContext();
 const root=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null),drawer=useRef<HTMLDivElement>(null);
 const [theme,setTheme]=useState<ViewTheme|undefined>(),[filters,setFilters]=useState<LibraryFilters>(emptyFilters),[narrow,setNarrow]=useState(false),[directoryOpen,setDirectoryOpen]=useState(false),[focusContent,setFocusContent]=useState(false);
 const [expanded,setExpanded]=useState<readonly string[]>([route.group?.id??'foundation']),[filteredExpanded,setFilteredExpanded]=useState<readonly string[]|null>(null);
 const [width,setWidth]=useState(1080),[height,setHeight]=useState(720),[sidebarWidth,setSidebarWidth]=useState(260);
 const filtering=hasLibraryFilters(filters);
 useEffect(()=>{const host=context.root?.current;if(host&&context.active&&context.enabled)return observeLibraryScrollbars(host);},[context.root,context.active,context.enabled]);
 const matching=useMemo(()=>searchComponentRecords(filters.query,{includePlanned:true,limit:catalogItems.length,library:filters.library||undefined,kind:filters.kind||undefined}).filter(i=>filters.availability==='all'||Boolean(i.available)===(filters.availability==='available')),[filters]);
 const matchingIds=useMemo(()=>new Set(matching.map(i=>i.id)),[matching]);
 const groups=useMemo(()=>componentGroups.map(g=>({...g,items:g.items.filter(i=>matchingIds.has(i.id))})).filter(g=>g.items.length),[matchingIds]);
 useLayoutEffect(()=>{const element=root.current;if(!element)return;let prior:boolean|undefined;const measure=()=>{setWidth(element.clientWidth);setHeight(element.clientHeight);const next=element.clientWidth<=660;if(next===prior)return;prior=next;setNarrow(next);setDirectoryOpen(false);};measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(route.group)setExpanded(old=>old.includes(route.group!.id)?old:[...old,route.group!.id]);},[route.group?.id]);
 useLayoutEffect(()=>{content.current?.scrollTo({top:0,behavior:'auto'});},[route.section,route.item?.id,route.group?.id,route.tab]);
 useLayoutEffect(()=>{if(!focusContent)return;const panel=drawer.current;const finish=()=>{if(panel?.getClientRects().length)return;if(context.active&&context.enabled)content.current?.focus({preventScroll:true});setFocusContent(false);};const observer=new ResizeObserver(finish);if(panel)observer.observe(panel);finish();return()=>observer.disconnect();},[focusContent,context.active,context.enabled]);
 useEffect(()=>{if(route.legacy)navigate({section:'catalog',study:null,group:null,item:null,tab:null,example:null},true);},[route.legacy,navigate]);
 const updateFilter=useCallback(<K extends keyof LibraryFilters>(key:K,value:LibraryFilters[K])=>{setFilters(old=>({...old,[key]:value}));setFilteredExpanded(null);},[]);
 const resetFilters=useCallback(()=>{setFilters({...emptyFilters});setFilteredExpanded(null);},[]);
 const resetFacetFilters=useCallback(()=>{setFilters(old=>({...old,availability:'all',library:'',kind:''}));setFilteredExpanded(null);},[]);
 const go=useCallback((parameters:Parameters<ApplicationSDK['navigate']>[0])=>{if(narrow&&directoryOpen){setFocusContent(true);setDirectoryOpen(false);}navigate(parameters);},[navigate,narrow,directoryOpen]);
 const overview=useCallback(()=>go({section:'catalog',group:null,item:null,tab:null,example:null,study:null}),[go]);
 const selectItem=useCallback((item:CatalogItem)=>go({section:item.available?.section??'catalog',group:null,item:item.available?null:item.id,tab:null,example:null,study:null}),[go]);
 const selectGroup=useCallback((id:string|null)=>go({section:'catalog',group:id,item:null,tab:null,example:null,study:null}),[go]);
 return {inventory:{groups:componentGroups.length,items:catalogItems.length,available:catalogItems.filter(i=>i.available).length,examples:componentContracts.reduce((n,c)=>n+c.examples.length,0)},route,root,content,drawer,theme,setTheme,filters,updateFilter,resetFilters,resetFacetFilters,filtering,matching,matchingIds,groups,narrow,directoryOpen,setDirectoryOpen,width,height,sidebarWidth,resizeSidebar:(sizes:number[])=>setSidebarWidth(Math.max(240,Math.min(420,Math.round(width*sizes[0]/100)))),
  expandedIds:filtering?(filteredExpanded??groups.map(g=>g.id)):expanded,
  setExpandedIds:(ids:string[])=>filtering?setFilteredExpanded(ids):setExpanded(ids),overview,selectItem,selectGroup,
  setTab:(tab:DetailTab)=>navigate({tab}),setExample:(example:string)=>navigate({example}),showUsage:(example:string)=>navigate({tab:'usage',example}),
 };
}
export type LibraryController=ReturnType<typeof useLibraryController>;
