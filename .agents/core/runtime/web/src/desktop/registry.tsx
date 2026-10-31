import { lazy, useEffect, useSyncExternalStore, type ComponentType } from 'react';
import { Activity,MessagesSquare, GitBranch, BookOpen, BookMarked, ChartNoAxesCombined, Disc3, LibraryBig, Package, Puzzle, Terminal } from 'lucide-react';
import type { OpenApp } from '../apps/app-services';
import { request } from '../apps/client';
import {applicationIcons} from '../apps/application-icon';
import {AppStoreIcon} from '../apps/app-store-icon';
import { ExternalApplication } from '../apps/external-application';
import { mainWindow, type ApplicationSnapshot, type AppRelease, type ApplicationCard, type InstalledApplication } from '../apps/application-model';
import { releaseKey } from '../apps/application-model';
import type { Bounds, WidgetLayout } from '../desktop-model';
export interface AppProps {search:URLSearchParams;navigate:(changes:Record<string,string|null>,replace?:boolean)=>void;onDiagnostics:()=>void;openApp?:OpenApp;onReleaseChanged?:(digest:string)=>Promise<void>}
export interface AppDefinition {id:string;name:string;icon:typeof MessagesSquare;component:ComponentType<AppProps>;multiInstance:boolean;defaultSize:Pick<Bounds,'width'|'height'>;minSize:Pick<Bounds,'width'|'height'>;release?:AppRelease}
const AppStore=lazy(()=>import('../apps/app-store').then(module=>({default:module.AppStore})));
const store:AppDefinition={id:'com.ksf.app-store',name:'应用商店',icon:AppStoreIcon,component:AppStore,multiInstance:false,defaultSize:{width:1040,height:720},minSize:{width:580,height:420}};
export const apps:AppDefinition[]=[store];
export let applicationsReady=false;
export let installedApplications:InstalledApplication[]=[];
let installedSignature='';
export function applicationShortcuts(){return [{id:store.id,name:store.name,installationId:'builtin',hasWindow:true,enabled:true,release:undefined as AppRelease|undefined},...installedApplications.map(app=>({id:app.id,name:app.active.manifest.name,installationId:app.installationId??`legacy:${app.id}`,hasWindow:!!mainWindow(app.active.manifest),enabled:app.enabled,release:app.active}))];}
export interface WidgetProps {compact?:boolean;visible?:boolean;open:(search:string,fresh?:boolean)=>void}
export interface WidgetDefinition {id:string;appId:string;appName:string;cardId:string;name:string;description:string;icon:typeof MessagesSquare;defaultSize:Pick<WidgetLayout,'w'|'h'>;minSize:Pick<WidgetLayout,'w'|'h'>;release:AppRelease;entry:ApplicationCard}
export const widgets:WidgetDefinition[]=[];
const icons:Record<string,typeof Package>={activity:Activity,conversations:MessagesSquare,flywheel:Disc3,documents:BookOpen,manual:BookMarked,knowledge:LibraryBig,abilities:Puzzle,git:GitBranch,terminal:Terminal,'work-stats':ChartNoAxesCombined};
const definitions=new Map<string,AppDefinition>(),cardDefinitions=new Map<string,WidgetDefinition>(),listeners=new Set<()=>void>();
let revision=0,pending:Promise<void>|undefined,timer:ReturnType<typeof setInterval>|undefined;
export function appDefinition(id:string,digest?:string){return digest?definitions.get(releaseKey(id,digest)):apps.find(app=>app.id===id);}
export function widgetDefinition(appId:string,cardId:string){return widgets.find(card=>card.appId===appId&&card.cardId===cardId);}
export async function refreshApplications(){
  if(pending)return pending;
  pending=(async()=>{
    const snapshot=await request<ApplicationSnapshot>('/api/apps/installed'),external:AppDefinition[]=[],cards:WidgetDefinition[]=[];
    void applicationIcons.refresh();
    for(const instance of snapshot.instances)if(instance.status==='stopped'&&instance.error)window.dispatchEvent(new CustomEvent('ksf:app-instance-failed',{detail:{id:instance.id,error:instance.error}}));
    for(const app of snapshot.installed.filter(app=>app.enabled)){
      const release=app.active,manifest=release.manifest,key=releaseKey(app.id,release.digest),entry=mainWindow(manifest);
      if(entry){let definition=definitions.get(key);if(!definition){
        const dimensions=(value:{width:number;height:number}|undefined,fallback:{width:number;height:number})=>({width:Math.max(320,Math.min(2000,Number(value?.width)||fallback.width)),height:Math.max(240,Math.min(1600,Number(value?.height)||fallback.height))});
        const window=manifest.window??manifest;
        definition={id:app.id,name:manifest.name,icon:icons[manifest.icon??'']??Package,component:props=><ExternalApplication {...props} release={release}/>,release,multiInstance:window.multiInstance!==false,defaultSize:dimensions(window.defaultSize,{width:1000,height:680}),minSize:dimensions(window.minSize,{width:480,height:320})};definitions.set(key,definition);
      }external.push(definition);}
      for(const card of manifest.cards??[]){const cardKey=`${key}:${card.id}`;let definition=cardDefinitions.get(cardKey);if(!definition){definition={...card,id:`${app.id}:${card.id}`,appId:app.id,appName:manifest.name,cardId:card.id,icon:icons[card.icon??'']??icons[manifest.icon??'']??Package,release,entry:card};cardDefinitions.set(cardKey,definition);}cards.push(definition);}
    }
    const order=['com.ksf.conversations','com.ksf.markdown','com.ksf.git','com.ksf.documentation','com.ksf.app-store'];const next=[store,...external].sort((a,b)=>{const x=order.indexOf(a.id),y=order.indexOf(b.id);return (x<0?5:x)-(y<0?5:y);});
    const signature=JSON.stringify(snapshot.installed.map(app=>[app.id,app.installationId,app.enabled,app.active.digest]));
    const changed=!applicationsReady||signature!==installedSignature||next.length!==apps.length||next.some((app,i)=>app!==apps[i])||cards.length!==widgets.length||cards.some((card,i)=>card!==widgets[i]);
    applicationsReady=true;installedSignature=signature;installedApplications=snapshot.installed;
    if(changed){apps.splice(0,apps.length,...next);widgets.splice(0,widgets.length,...cards);revision++;listeners.forEach(listener=>listener());}
  })().finally(()=>{pending=undefined;});return pending;
}
export function useApplications(){const value=useSyncExternalStore(callback=>{listeners.add(callback);return()=>{listeners.delete(callback);};},()=>revision);useEffect(()=>{void refreshApplications().catch(()=>{});timer??=setInterval(()=>{if(!document.hidden)void refreshApplications().catch(()=>{});},2000);return()=>{if(!listeners.size){clearInterval(timer);timer=undefined;}};},[]);return value;}
