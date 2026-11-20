import {useLayoutEffect,type RefObject} from 'react';
import {createMagicBentoEngine,type BentoEntry} from '../vendor/magic-bento/engine';

/** Register stable CardGrid frames with the original React Bits frame engine. */
export function DesktopCardEffects({grid,paused,motion,layoutKey}:{grid:RefObject<HTMLDivElement|null>;paused:boolean;motion:boolean;layoutKey:string}){
 useLayoutEffect(()=>{
  const root=grid.current,viewport=root?.closest<HTMLElement>('.desktop-grid-scroll');if(!root||!viewport)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)'),contrast=matchMedia('(forced-colors: active), (prefers-contrast: more)');
  const entries=():BentoEntry[]=>{
   const view=viewport.getBoundingClientRect();
   return [...root.querySelectorAll<HTMLElement>('[data-bento-card]')].flatMap(frame=>{
    const visual=frame.querySelector<HTMLElement>('.desktop-card-visual');if(!visual)return [];
    const r=frame.getBoundingClientRect(),tile=frame.closest<HTMLElement>('.desktop-tile')?.getBoundingClientRect()??r;
    return [{frame,visual,box:{width:r.width,height:r.height,left:Math.max(0,r.left-Math.max(tile.left,view.left)),right:Math.max(0,Math.min(tile.right,view.right)-r.right),top:Math.max(0,r.top-Math.max(tile.top,view.top)),bottom:Math.max(0,Math.min(tile.bottom,view.bottom)-r.bottom)},visible:r.bottom>view.top&&r.top<view.bottom&&r.right>view.left&&r.left<view.right}];
   });
  };
  const engine=createMagicBentoEngine(root,entries,()=>motion&&!paused&&!reduced.matches&&!contrast.matches&&!document.hidden);
  reduced.addEventListener('change',engine.sync);contrast.addEventListener('change',engine.sync);document.addEventListener('visibilitychange',engine.sync);
  engine.sync();
  return()=>{reduced.removeEventListener('change',engine.sync);contrast.removeEventListener('change',engine.sync);document.removeEventListener('visibilitychange',engine.sync);engine.dispose();};
 },[grid,paused,motion,layoutKey]);
 return null;
}
