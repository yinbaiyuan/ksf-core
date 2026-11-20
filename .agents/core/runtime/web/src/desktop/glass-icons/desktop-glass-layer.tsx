import {desktopIconGlassIntensity,desktopIconTilt,dockIconGlassIntensity,dockIconTilt} from '../../material-settings';
import {useLayoutEffect,useRef,useState,useSyncExternalStore,type RefObject} from 'react';
import {iconGlassRadius} from './shape';
import {iconLayerCatalog} from '../icon-layer-catalog';
import {createGlassEngine,type GlassFrame} from './engine';
import './desktop-glass-layer.css';

type Props={intensity?:number;tilt?:number;bleed?:number;viewport?:RefObject<HTMLElement|null>;grid:RefObject<HTMLElement|null>;size:number;paused:boolean;motion:boolean;theme:string;layoutKey:string};
export function DesktopGlassLayer(props:Props){return <IconGlassLayer {...props} surface="desktop"/>;}
export function DockGlassLayer(props:Props){return <IconGlassLayer {...props} surface="dock"/>;}

/** Artwork only: the existing shortcut DOM retains every input and accessible name. */
function IconGlassLayer({grid,viewport:clip,size,paused,motion,theme,layoutKey,intensity,tilt,bleed=0,surface}:Props&{surface:"desktop"|"dock"}){
 const dock=surface==="dock",pauseKey=dock?false:paused;
 const interaction=useRef(paused),updateInteraction=useRef<()=>void>(()=>{});interaction.current=paused;
 const overlay=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const [anchorRevision,setAnchorRevision]=useState(0);
 const strength=(dock?dockIconGlassIntensity:desktopIconGlassIntensity)(intensity),angle=(dock?dockIconTilt:desktopIconTilt)(tilt);
 const look=useRef({strength,angle}),updateLook=useRef<()=>void>(()=>{});look.current={strength,angle};
 const revision=useSyncExternalStore(iconLayerCatalog.subscribe,iconLayerCatalog.snapshot);
 useLayoutEffect(()=>{
  const root=overlay.current,paint=canvas.current,source=grid.current,viewport=clip?.current??(dock?source:source?.closest<HTMLElement>('.desktop-grid-scroll'));
  if(!root||!paint||!source||!viewport)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),contrast=matchMedia('(forced-colors: active)');
  const anchors:HTMLElement[]=[],items:HTMLElement[]=[],plates:HTMLElement[]=[],glasses:HTMLElement[]=[],faces:HTMLElement[]=[],colors:string[]=[];
  // CardGrid may commit the new group's shortcuts after this layout effect.
  // Track every anchor, including original-image fallbacks, so late mounts,
  // removals and reused nodes with another app rebuild the paint registration.
  let scanned=[...source.querySelectorAll<HTMLElement>('[data-layer-app]')].map(anchor=>({anchor,appId:anchor.dataset.layerApp}));
  let alive=true,raf=0,followUntil=0;
  const geometry=()=>{
   const r=viewport.getBoundingClientRect(),parent=root.offsetParent?.getBoundingClientRect();
   if(!parent)return;
   if(dock){
    // Keep a whole foreground reachable even when the rail is only one icon wide.
    let width=r.width;
    if(source.classList.contains('dock-presence-rail')&&source.parentElement){
     const parent=source.parentElement,taskbar=parent.closest<HTMLElement>('.os-dock'),max=taskbar?taskbar.clientWidth-2*(parseFloat(getComputedStyle(taskbar).getPropertyValue('--taskbar-side'))||0):parseFloat(getComputedStyle(parent).maxWidth);
     if(Number.isFinite(max))width=max-[...parent.children].filter(child=>child!==source&&getComputedStyle(child).position!=='absolute').reduce((total,child)=>{const css=getComputedStyle(child);return total+child.getBoundingClientRect().width+(parseFloat(css.marginLeft)||0)+(parseFloat(css.marginRight)||0);},0);
    }
    const padding=`${Math.min(size*.32,Math.max(0,(width-size)/2))}px`;
    if(source.style.getPropertyValue('--dock-glass-inline-pad')!==padding)source.style.setProperty('--dock-glass-inline-pad',padding);
   }
   // A standalone launcher has no scroll rail padding for its offset plate/float.
   root.style.left=`${r.left-parent.left-bleed}px`;root.style.top=`${r.top-parent.top-bleed}px`;root.style.width=`${r.width+2*bleed}px`;root.style.height=`${r.height+2*bleed}px`;
  };
  const frame:GlassFrame={anchors,items,plates,glasses,faces,opacity:dock?anchor=>{
   let value=1;for(let node:HTMLElement|null=anchor;node&&node!==source;node=node.parentElement)value*=Number(getComputedStyle(node).opacity);
   return value;
  }:undefined,static:!motion||reduced.matches,
   settings:{count:0,tile:size,radius:iconGlassRadius(size,dock?'dock':'desktop'),edge:Math.max(2,Math.round(size*.26*(dock ? .5 : .32))),strength:size*.3*.8,split:0,soft:1+size*.15,
    glassOpacity:1,shine:.55,shade:theme.endsWith('light')?.14:.22,tint:'#dfdfdf',tintOpacity:.14,plate:dock?'offset':'tilt',hover:paused?'none':dock?'float':'press',labels:'none',tilt:dock?0:4,spread:dock ? .35 : .5,parallax:paused?0:1,intro:false,colors,colorKey:''}};
  root.dataset.theme=theme;
  const material=createGlassEngine(root,paint,()=>frame,on=>root.classList.toggle('is-gpu',on));
  const applyAppearance=()=>{
   const {strength,angle}=look.current;
   Object.assign(frame.settings,{glassOpacity:Math.min(1,strength),strength:size*.24*strength,soft:1+size*.15*(dock ? .2 : 1)*strength,shine:.55*strength,shade:(theme.endsWith('light')?.14:.22)*strength,tintOpacity:.14*strength,tilt:angle});
   root.style.setProperty('--desktop-glass-intensity',String(strength));
   root.style.setProperty('--desktop-glass-opacity',String(Math.min(1,strength)));
   root.style.setProperty('--desktop-glass-blur',`${(dock?2:10)*strength}px`);
   root.style.setProperty('--desktop-glass-saturation',String(1+.4*strength));
   root.style.setProperty('--desktop-glass-tilt',`${angle}deg`);
   root.classList.toggle('is-flat',strength===0);
   root.style.setProperty('--dock-glass-offset',`${size*.35*.26}px`);
   material.engine.sync();
  };
  updateLook.current=applyAppearance;
  const applyInteraction=()=>{
   if(!dock)return;
   frame.settings.hover=interaction.current?'none':'float';frame.settings.parallax=interaction.current?0:1;
   anchors.forEach((anchor,i)=>{material.engine.hover(i,!interaction.current&&(anchor.parentElement?.matches(':hover,:focus-visible')??false));if(interaction.current){material.engine.aim(i,0,0);material.engine.press(i,false);}});
   material.engine.sync();
  };
  updateInteraction.current=applyInteraction;
  const tick=()=>{raf=0;if(!alive||document.hidden)return;geometry();material.engine.sync();if(performance.now()<followUntil)raf=requestAnimationFrame(tick);};
  const sync=()=>{if(!raf&&alive)raf=requestAnimationFrame(tick);};
  const follow=()=>{followUntil=performance.now()+420;geometry();material.engine.sync();sync();};
  const register=(anchor:HTMLElement)=>{
   const layer=iconLayerCatalog.get(anchor.dataset.layerApp??'');
   if(layer?.status!=='ready'||!layer.foreground||!layer.background)return;
   // Only same-origin managed PNGs can enter this host-private paint layer.
   if(!/^\/api\/apps\/icon-layer\?key=[a-f0-9]{64}&digest=[a-f0-9]{64}$/.test(layer.foreground.url))return;
   const cleanups:(()=>void)[]=[],hit=anchor.parentElement!,item=document.createElement('span'),plate=document.createElement('span'),glass=document.createElement('span'),face=document.createElement('span'),image=document.createElement('img');
   item.className='desktop-glass-icon';item.dataset.appId=anchor.dataset.layerApp;item.hidden=true;
   plate.className='desktop-glass-plate';glass.className='desktop-glass-material';face.className='desktop-glass-face';image.alt='';image.draggable=false;
   const gradient=`linear-gradient(${layer.background.angle}deg,${layer.background.colors[0]},${layer.background.colors[1]})`;plate.style.background=gradient;
   item.style.setProperty('--desktop-glass-radius',`${frame.settings.radius}px`);
   item.append(plate,glass,face);face.append(image);root.append(item);
   const index=()=>anchors.indexOf(anchor);let registered=true;
   const restore=()=>{item.hidden=true;delete anchor.dataset.glassRendered;};
   image.onload=()=>{if(!alive||!registered)return;if(image.naturalWidth<1){restore();return;}item.hidden=false;anchor.dataset.glassRendered='true';sync();};
   image.onerror=restore;image.src=layer.foreground.url;
   const listen=(name:string,callback:EventListener)=>{hit.addEventListener(name,callback);cleanups.push(()=>hit.removeEventListener(name,callback));};
   const interactive=()=>!interaction.current&&motion&&!reduced.matches&&!contrast.matches;
   listen('pointerenter',event=>{if(interactive()&&(event as PointerEvent).pointerType!=='touch')material.engine.hover(index(),true);});
   listen('pointermove',event=>{if(!interactive()||(event as PointerEvent).pointerType==='touch')return;const r=hit.getBoundingClientRect(),e=event as PointerEvent;material.engine.aim(index(),Math.max(-1,Math.min(1,(e.clientX-r.left)/r.width*2-1)),Math.max(-1,Math.min(1,(e.clientY-r.top)/r.height*2-1)));});
   listen('pointerleave',()=>material.engine.hover(index(),false));
   listen('pointerdown',()=>{if(interactive())material.engine.press(index(),true);});
   for(const name of ['pointerup','pointercancel'])listen(name,()=>material.engine.press(index(),false));
   listen('focus',()=>{if(interactive())material.engine.hover(index(),hit.matches(':focus-visible'));sync();});
   listen('blur',()=>{material.engine.hover(index(),false);sync();});
   return {appId:anchor.dataset.layerApp,item,plate,glass,face,gradient,dispose:()=>{registered=false;restore();image.onload=null;image.onerror=null;cleanups.forEach(dispose=>dispose());item.remove();}};
  };
  // Keep surviving Dock artwork, decoded PNGs and input listeners across changes.
  // Desktop retains its group remount path for delayed CardGrid commits.
  const entries=new Map<HTMLElement,NonNullable<ReturnType<typeof register>>>();
  const reconcile=()=>{
   scanned=[...source.querySelectorAll<HTMLElement>('[data-layer-app]')].map(anchor=>({anchor,appId:anchor.dataset.layerApp}));
   for(const [anchor,entry] of entries)if(!scanned.some(candidate=>candidate.anchor===anchor&&candidate.appId===entry.appId)){entry.dispose();entries.delete(anchor);}
   for(const list of [anchors,items,plates,glasses,faces,colors])list.length=0;
   const top=(anchor:HTMLElement)=>dock&&(anchor.parentElement?.matches('.is-dragging,.is-settling')??false);
   const ordered=dock?[...scanned].sort((a,b)=>Number(top(a.anchor))-Number(top(b.anchor))):scanned;
   if(!contrast.matches)for(const {anchor} of ordered){
    let entry=entries.get(anchor);if(!entry){entry=register(anchor);if(entry)entries.set(anchor,entry);}
    if(!entry)continue;entry.item.style.zIndex=top(anchor)?'4':'2';
    anchors.push(anchor);items.push(entry.item);plates.push(entry.plate);glasses.push(entry.glass);faces.push(entry.face);colors.push(entry.gradient);
   }
   frame.settings.count=anchors.length;frame.settings.colorKey=colors.join('|');
  };
  reconcile();
  const changes=new MutationObserver(records=>{
   if(!alive)return;
   if(records.some(record=>record.type==='childList'||record.attributeName==='data-layer-app')){
    const current=[...source.querySelectorAll<HTMLElement>('[data-layer-app]')];
    if(current.length!==scanned.length||current.some((anchor,i)=>anchor!==scanned[i].anchor||anchor.dataset.layerApp!==scanned[i].appId)){
     if(dock)reconcile();else {setAnchorRevision(value=>value+1);return;}
    }
   }
   if(dock&&records.some(record=>record.type==='attributes'&&record.attributeName==='class'&&(record.target as Element).matches('[data-dock-app]')))reconcile();
   follow();
  });changes.observe(source,{subtree:true,attributes:true,attributeFilter:['style','class','data-layer-app'],childList:true});
  const resize=new ResizeObserver(sync);resize.observe(viewport);resize.observe(source);
  const preferences=()=>{if(dock&&!contrast.matches)reconcile();frame.static=!motion||reduced.matches;anchors.forEach((_,i)=>{material.engine.hover(i,false);material.engine.aim(i,0,0);material.engine.press(i,false);});for(const item of items)item.hidden=contrast.matches;if(contrast.matches)anchors.forEach(a=>delete a.dataset.glassRendered);else anchors.forEach((a,i)=>{const image=faces[i].firstElementChild as HTMLImageElement;if(image.complete&&image.naturalWidth){a.dataset.glassRendered='true';items[i].hidden=false;}});sync();};
  reduced.addEventListener('change',preferences);contrast.addEventListener('change',preferences);
  viewport.addEventListener('scroll',sync,{passive:true});window.addEventListener('resize',sync);document.addEventListener('visibilitychange',sync);
  source.addEventListener('transitionrun',follow);source.addEventListener('transitionend',sync);geometry();applyAppearance();applyInteraction();
  return()=>{alive=false;updateLook.current=()=>{};updateInteraction.current=()=>{};cancelAnimationFrame(raf);changes.disconnect();resize.disconnect();if(dock)source.style.removeProperty("--dock-glass-inline-pad");material.dispose();entries.forEach(entry=>entry.dispose());viewport.removeEventListener('scroll',sync);window.removeEventListener('resize',sync);document.removeEventListener('visibilitychange',sync);source.removeEventListener('transitionrun',follow);source.removeEventListener('transitionend',sync);reduced.removeEventListener('change',preferences);contrast.removeEventListener('change',preferences);};
 },[grid,clip,size,pauseKey,motion,theme,layoutKey,revision,dock,bleed,anchorRevision]);
 useLayoutEffect(()=>{updateLook.current();},[strength,angle]);
 useLayoutEffect(()=>{updateInteraction.current();},[paused]);
 return <div ref={overlay} className={"desktop-glass-layer"+(dock?" dock-glass-layer":"")} aria-hidden="true"><canvas ref={canvas}/></div>;
}
