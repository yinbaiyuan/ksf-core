import {lazy,Suspense,useEffect,useState,type CSSProperties} from 'react';
import {useMaterial} from './material-provider';
import {sideRaysIntensity} from '../material-settings';
import './workbench-backdrop.css';

const SideRays=lazy(()=>import('../vendor/side-rays/side-rays'));
const Drape=lazy(()=>import('../vendor/drape-background/drape-background'));
const AeroShards=lazy(()=>import('./aero-shards-backdrop'));
const graphicsQueries=['(prefers-reduced-transparency: reduce)','(prefers-contrast: more)','(forced-colors: active)'];
export function WorkbenchBackdrop(){
  const {settings}=useMaterial();
  const [graphics,setGraphics]=useState(()=>!graphicsQueries.some(query=>matchMedia(query).matches));
  const [reduceMotion,setReduceMotion]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    const motionChange=()=>setReduceMotion(motion.matches);
    motion.addEventListener('change',motionChange);
    const queries=graphicsQueries.map(query=>matchMedia(query));
    const change=()=>setGraphics(!queries.some(query=>query.matches));
    change();queries.forEach(query=>query.addEventListener('change',change));
    return()=>{queries.forEach(query=>query.removeEventListener('change',change));motion.removeEventListener('change',motionChange);};
  },[]);
  const rays=settings.backgroundMode==='side-rays';
  const drape=settings.backgroundMode==='drape';
  const aero=settings.backgroundMode==='aero-shards';
  const strength=sideRaysIntensity(settings.sideRaysIntensity);
  return <div className={`workbench-backdrop${rays?' is-side-rays':''}${drape?' is-drape':''}${aero?' is-aero-shards':''}`} data-background={aero?'aero-shards':drape?'drape':rays?'side-rays':'mountain'} aria-hidden="true">
    {aero&&<Suspense fallback={null}><AeroShards graphics={graphics} motion={settings.motion&&!reduceMotion}/></Suspense>}
    {drape&&graphics&&<Suspense fallback={null}><Drape motion={settings.motion&&!reduceMotion} interactive={settings.motion&&!reduceMotion}/></Suspense>}
    {rays&&graphics&&strength>0&&<Suspense fallback={null}><SideRays rayColor1="#FFE1A0" rayColor2="#FFF4DD" blend={.35} speed={settings.motion&&!reduceMotion?1.5:0} followMouse={settings.motion&&!reduceMotion} mouseInfluence={.25} intensity={3.6*strength} opacity={1} density={7} sharpness={.75} falloff={1.25} glow={.7} intro={false} maxDevicePixelRatio={1.5} style={{'--side-rays-strength':strength} as CSSProperties}/></Suspense>}
  </div>;
}
