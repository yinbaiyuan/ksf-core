import {useMemo,type CSSProperties,type RefObject} from 'react';
import {GlassSurface as RefractiveGlassSurface} from '../../../../applications/sdk/src/components/glass-surface';
import {MaterialContext,useMaterial} from './material-provider';
import {useHostTheme} from './host-theme';
import {useWindowContext} from '../window-context';
import {barGlassIntensity,cardGlassIntensity,windowTitlebarGlassIntensity,tintColor,type ProfileId} from '../material-settings';

type Props={hostChrome?:boolean;scaleBlurByIntensity?:boolean;radius?:number;geometryAnchor?:RefObject<HTMLElement|null>;profile?:ProfileId;mode?:'wallpaper'|'frost'|'native-frost';variant?:'panel'|'selection'|'button';blur?:number;strength?:number;backdrop?:string};
/** Host materials stay independent of application content and its styles. */
export function GlassSurface({hostChrome=false,scaleBlurByIntensity=false,profile='drawer',blur,radius,geometryAnchor,mode='wallpaper',...props}:Props) {
  const material=useMaterial(),{settings}=material,{id}=useWindowContext();
  const theme=useHostTheme();
  const bar=profile==='dock'||profile==='statusbar';
  const card=profile==='card',window=profile==='window',refractive=bar||card||window;
  const intensity=card?cardGlassIntensity(settings.cardGlassIntensity):window?windowTitlebarGlassIntensity(settings.windowTitlebarGlassIntensity):bar?barGlassIntensity(settings.barGlassIntensity)[profile as 'dock'|'statusbar']:1;
  const opticalMaterial=useMemo(()=>{
    if(!refractive)return material;
    const saved=settings.profiles[profile];
    // Keep the upstream panel/rod optics, straight host frames, and saved tint opacity/blur.
    const optics=card?{
      tint:'#EFF4FA',radius:radius??2,refraction:24*intensity,bezel:.3,curvature:4,
      chroma:.1*intensity,specular:Math.min(1,.5*intensity),
    }:{
      tint:theme==='host-theme-dark'?'#1C2B3C':'#EFF4FA',radius:radius??0,
      refraction:(profile==='dock'?18:14)*intensity,bezel:1,curvature:2.5,
      chroma:.1*intensity,specular:Math.min(1,.65*intensity),
    };
    return {...material,settings:{...settings,profiles:{...settings.profiles,[profile]:{
      ...saved,...optics,specularWidth:2,shadowOpacity:0,
    }}}};
  },[card,refractive,material,profile,settings,theme,radius,intensity]);
  if(id!=='standalone'&&!hostChrome)return null;
  if(mode==='native-frost'){
    // A tilted card samples the live scene. Keep blur in the native compositor,
    // independent of SVG lens maps or a wallpaper copy inside the moving card.
    const plane=opticalMaterial.settings.profiles[profile];
    // Desktop chrome blends with the wallpaper; reading windows have a stable
    // neutral backing, independent of wallpaper brightness or saved glass tint.
    return <span aria-hidden="true" className="glass-surface host-live-frost" data-glass-profile={profile} style={{'--lg-tint':window?'rgb(var(--host-panel-rgb) / .96)':tintColor(plane),'--lg-fallback':`blur(${(blur??plane.blur)*(scaleBlurByIntensity?intensity:1)}px) saturate(${window?1.1:1.6})`,'--lg-live-highlight':window?Math.min(.08,plane.specular):plane.specular} as CSSProperties}/>;
  }
  if(refractive)return <MaterialContext.Provider value={opticalMaterial}><RefractiveGlassSurface {...props} mode={mode} profile={profile} blur={blur} geometryAnchor={geometryAnchor}/></MaterialContext.Provider>;
  const plane=settings.profiles[profile];
  return <span aria-hidden="true" className="host-frost" style={{'--host-opacity':plane.opacity,'--host-blur':`${blur??plane.blur}px`} as CSSProperties}/>;
}
