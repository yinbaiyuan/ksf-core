import { useState,useEffect,useRef } from 'react';
import { RotateCcw } from 'lucide-react';
import { backdropLimits, bounded, defaultMaterialSettings, desktopAppearance, desktopAppearanceLimits, sideRaysIntensity, sideRaysIntensityLimits, barGlassIntensity, windowTitlebarGlassIntensity, barGlassIntensityLimits, desktopIconGlassIntensity, desktopIconGlassIntensityLimits, desktopIconTilt, desktopIconTiltLimits, dockIconGlassIntensity, dockIconGlassIntensityLimits, dockIconTilt, dockIconTiltLimits, profileLimits, type BackdropSettings, type ProfileId } from '../material-settings';
import { useMaterial } from './material-provider';
import type {MaterialSettings} from '../material-settings';
import type {MaterialSaveStatus} from '../../../../applications/sdk/src/components/material-provider';
import {Button} from '@ksf/sdk/button';
import {RadioGroup} from '@ksf/sdk/radio-group';
import {Select} from '@ksf/sdk/select';
import {Slider} from '@ksf/sdk/slider';
import {TextField as Input} from '@ksf/sdk/text-field';
import {Switch} from '@ksf/sdk/switch';
import {SettingsLink,useSettingsDetail,useSettingsDraft,useSettingsNavigation} from '../desktop/settings-controls';
import {SettingsItemIcon} from '../desktop/settings-icons';
function Range({ label, value, limits, unit = '', scale, onChange, hint }: { label: string; value: number; limits: readonly [number, number, number]; unit?: string; scale?: number; onChange: (n: number) => void; hint?: string }) {
  const factor = scale ?? (unit === '%' ? 100 : 1), displayed = Number((value * factor).toFixed(2));
  const [text,setText]=useState(String(displayed)),focused=useRef(false),valid=text.trim()!==''&&Number.isFinite(Number(text));
  useEffect(()=>{if(!focused.current)setText(String(displayed));},[displayed]);
  useSettingsDraft(!valid,false,()=>setText(String(displayed)),async()=>false);
  return <div className="material-range"><div className="material-range-heading"><span>{label}</span><span className="material-number"><Input inputMode="decimal" required pattern="[+\-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)" aria-label={`${label}数值`} value={text} error={!valid?'请填写有效数值':undefined} onFocus={()=>{focused.current=true;}} onBlur={()=>{focused.current=false;if(valid)setText(String(displayed));}} onValueChange={draft=>{setText(draft);if(draft.trim()!==''&&Number.isFinite(Number(draft)))onChange(bounded(Number(draft)/factor,limits));}}/><span>{unit}</span></span></div><Slider label={label} aria-label={`${label}滑块`} min={limits[0]} max={limits[1]} step={limits[2]} value={value} aria-valuetext={`${displayed}${unit}`} onValueChange={onChange}/>{hint && <small>{hint}</small>}</div>;
}
export function MaterialSettingsContent({value,onUpdate,status,manual=false,defaults:providedDefaults,onResetAll}:{value?:MaterialSettings;defaults?:MaterialSettings;onResetAll?:()=>void;onUpdate?:(change:(v:MaterialSettings)=>MaterialSettings)=>void;status?:MaterialSaveStatus;manual?:boolean}={}) {
  const material=useMaterial(),settings=value??material.settings,update=onUpdate??material.update,saved=status??material.saved,defaults=providedDefaults??defaultMaterialSettings();
  const desktop=desktopAppearance(settings.desktop);
  const glass=barGlassIntensity(settings.barGlassIntensity);
  const [target,setTarget]=useState<Exclude<ProfileId,'card'>|'backdrop'>('backdrop');
  const [advanced,setAdvanced]=useState(false),navigate=useSettingsNavigation();
  useSettingsDetail(advanced?'appearance-advanced':null,'高级外观参数',()=>setAdvanced(false));
  const profile=target==='backdrop'?null:settings.profiles[target];
  const modes=[['system','跟随系统'],['light','浅色'],['dark','深色']] as const;
  function resetCurrent(){update(v=>target==='backdrop'?{...v,backdrop:defaults.backdrop}:{...v,...(target==='window'?{windowTitlebarGlassIntensity:1}:target==='dock'||target==='statusbar'?{barGlassIntensity:{...barGlassIntensity(v.barGlassIntensity),[target]:1}}:{}),profiles:{...v.profiles,[target]:defaults.profiles[target]}});}
  return <div className="material-settings-inline" onInvalidCapture={event=>{const target=event.target;if(target instanceof HTMLElement&&target.closest('.material-settings-base[hidden]')){setAdvanced(false);requestAnimationFrame(()=>{if(!target.closest('[inert]'))target.focus();});}}}>{!manual&&<p className="settings-description">选择工作台外观，调整后自动保存到当前 KSF 实例。</p>}
    <div className="material-settings-base" hidden={advanced}>
    <RadioGroup className="settings-theme-choices" label="主题" appearance="button" fullWidth value={settings.themeMode??'system'} options={modes.map(([value,label])=>({value,label,icon:<SettingsItemIcon kind={value==='system'?'desktop':value==='light'?'sun':'moon'}/>}))} onValueChange={mode=>update(v=>({...v,themeMode:mode as 'system'|'light'|'dark'}))}/>
    <p className="material-object-note">跟随系统会随设备的浅深外观自动切换。工作台外壳使用冷调磨砂，应用内容保留各自外观。</p>
    <RadioGroup className="settings-background-choices" label="桌面背景" appearance="button" value={settings.backgroundMode??'mountain'} options={([['mountain','山景'],['side-rays','山景＋侧光'],['drape','Drape 布帘'],['aero-shards','Aero Shards 冰川']] as const).map(([value,label])=>({value,label}))} onValueChange={mode=>update(v=>({...v,backgroundMode:mode as 'mountain'|'side-rays'|'drape'|'aero-shards'}))}/>
    {settings.backgroundMode==='aero-shards'&&<p className="material-object-note">冰蓝色玻璃碎片在右侧缓缓流动，桌面空白处可拨动、点击或按住聚拢。关闭动效时保持静态。</p>}
    {settings.backgroundMode==='drape'&&<p className="material-object-note">随风轻摆的布帘。在桌面空白处移动鼠标或按住拖动，可推拉布料；关闭界面动效时保持静态。</p>}
    {settings.backgroundMode==='side-rays'&&<p className="material-object-note">在原山景上叠加 Side Rays 光束，缓慢流动并轻微跟随鼠标。关闭界面动效或开启系统“减少动态效果”时显示静态光束。</p>}
    {settings.backgroundMode==='side-rays'&&<fieldset className="desktop-appearance-settings"><legend>侧光</legend>
      <Range label="光线强度" value={sideRaysIntensity(settings.sideRaysIntensity)} limits={sideRaysIntensityLimits} unit="%" hint="100% 为当前增强效果；0% 仅显示山景。" onChange={sideRaysIntensity=>update(v=>({...v,sideRaysIntensity}))}/>
      <Button variant="outlined" onClick={()=>update(v=>({...v,sideRaysIntensity:1}))}><RotateCcw size={13}/>恢复默认强度</Button>
    </fieldset>}
    <fieldset className="desktop-appearance-settings"><legend>桌面排列</legend>
      <Range label="桌面图标大小" value={desktop.iconSize} limits={desktopAppearanceLimits.iconSize} unit="px" onChange={iconSize=>update(v=>({...v,desktop:{...desktopAppearance(v.desktop),iconSize}}))}/>
      <Range label="格子间距" value={desktop.gap} limits={desktopAppearanceLimits.gap} unit="px" onChange={gap=>update(v=>({...v,desktop:{...desktopAppearance(v.desktop),gap}}))}/>
      <p className="material-object-note">格子随图标大小调整，卡片与图标保持相同的四周留白。</p>
      <Button variant="outlined" onClick={()=>update(v=>({...v,desktop:desktopAppearance()}))}><RotateCcw size={13}/>恢复桌面默认</Button>
    </fieldset>
    </div>
    {!advanced?<SettingsLink title="高级外观参数" description="桌面与 Dock 图标、玻璃强度、背景参数和动效" onClick={()=>navigate(()=>setAdvanced(true))}/>:<>    <fieldset className="desktop-appearance-settings"><legend>桌面图标效果</legend>
      <Range label="桌面图标玻璃强度" value={desktopIconGlassIntensity(settings.desktopIconGlassIntensity)} limits={desktopIconGlassIntensityLimits} unit="%" hint="100% 为当前效果；0% 关闭图标玻璃，保留前景和背景颜色。" onChange={desktopIconGlassIntensity=>update(v=>({...v,desktopIconGlassIntensity}))}/>
      <Range label="桌面图标倾斜角度" value={desktopIconTilt(settings.desktopIconTilt)} limits={desktopIconTiltLimits} unit="°" hint="调整背景底板的倾斜方向，0° 为正放。" onChange={desktopIconTilt=>update(v=>({...v,desktopIconTilt}))}/>
      <p className="material-object-note">只影响桌面分层图标，原图回退不受影响。</p>
      <Button variant="outlined" onClick={()=>update(v=>({...v,desktopIconGlassIntensity:1,desktopIconTilt:4}))}><RotateCcw size={13}/>恢复图标效果默认</Button>
    </fieldset>
    <fieldset className="desktop-appearance-settings"><legend>Dock 图标效果</legend>
      <Range label="Dock 图标玻璃强度" value={dockIconGlassIntensity(settings.dockIconGlassIntensity)} limits={dockIconGlassIntensityLimits} unit="%" hint="100% 为标准效果；0% 关闭图标玻璃，保留前景和背景颜色。" onChange={dockIconGlassIntensity=>update(v=>({...v,dockIconGlassIntensity}))}/>
      <Range label="Dock 图标倾斜角度" value={dockIconTilt(settings.dockIconTilt)} limits={dockIconTiltLimits} unit="°" hint="调整错位底板的倾斜方向，0° 为正放。" onChange={dockIconTilt=>update(v=>({...v,dockIconTilt}))}/>
      <p className="material-object-note">只影响 Dock 中的分层应用图标，与桌面图标和 Dock 栏背景分别调节。</p>
      <Button variant="outlined" onClick={()=>update(v=>({...v,dockIconGlassIntensity:1,dockIconTilt:0}))}><RotateCcw size={13}/>恢复 Dock 图标默认</Button>
    </fieldset>
    <fieldset className="desktop-appearance-settings"><legend>实时毛玻璃</legend>
      <Range label="顶部栏玻璃强度" value={glass.statusbar} limits={barGlassIntensityLimits} unit="%" onChange={statusbar=>update(v=>({...v,barGlassIntensity:{...barGlassIntensity(v.barGlassIntensity),statusbar}}))}/>
      <Range label="Dock 玻璃强度" value={glass.dock} limits={barGlassIntensityLimits} unit="%" onChange={dock=>update(v=>({...v,barGlassIntensity:{...barGlassIntensity(v.barGlassIntensity),dock}}))}/>
      <Range label="应用顶部栏玻璃强度" value={windowTitlebarGlassIntensity(settings.windowTitlebarGlassIntensity)} limits={barGlassIntensityLimits} unit="%" onChange={windowTitlebarGlassIntensity=>update(v=>({...v,windowTitlebarGlassIntensity}))}/>
      <p className="material-object-note">分别调整顶部状态栏、Dock 和应用窗口顶部栏的磨砂与边缘高光。100% 使用各自已保存的模糊值；0% 关闭模糊和高光，保留色层。</p>
      <Button variant="outlined" onClick={()=>update(v=>({...v,barGlassIntensity:barGlassIntensity(),windowTitlebarGlassIntensity:1}))}><RotateCcw size={13}/>恢复玻璃默认</Button>
    </fieldset>
    <div className="material-settings-top"><span>调整对象</span><Select aria-label="调整对象" value={target} onValueChange={v=>setTarget(v as typeof target)} options={[{value:"backdrop",label:"雪山背景"},{value:"dock",label:"任务栏"},{value:"statusbar",label:"顶部状态栏"},{value:"window",label:"应用顶部栏"}]}/></div>
    <div className="material-settings-content" key={target}>{profile?<>
      <Range label="色层不透明度" value={profile.opacity} limits={profileLimits.opacity} unit="%" onChange={opacity=>update(v=>({...v,profiles:{...v.profiles,[target]:{...v.profiles[target as ProfileId],opacity}}}))}/>
      <Range label="磨砂模糊" value={profile.blur} limits={profileLimits.blur} unit="px" onChange={blur=>update(v=>({...v,profiles:{...v.profiles,[target]:{...v.profiles[target as ProfileId],blur}}}))}/>
    </>:<>{(['wash','brightness','saturation','x','y'] as (keyof BackdropSettings)[]).map(key=><Range key={key} label={{wash:'冷白遮罩',brightness:'图片亮度',saturation:'图片饱和度',x:'水平位置',y:'垂直位置'}[key]} value={settings.backdrop[key]} limits={backdropLimits[key]} unit="%" scale={['x','y'].includes(key)?1:100} onChange={n=>update(v=>({...v,backdrop:{...v.backdrop,[key]:n}}))}/>)}</>}</div>
</>}
    <div className="material-settings-bottom"><div className="settings-option-row"><div><span>界面动效</span><small>系统的减少动态效果、减少透明度和高对比度偏好优先。</small></div><Switch label="启用界面动效" checked={settings.motion} onCheckedChange={motion=>update(v=>({...v,motion}))}/></div>{(advanced||!manual)&&<div><Button variant="outlined" onClick={resetCurrent}><RotateCcw size={13}/>重置当前对象</Button>{!manual&&<Button variant="text" onClick={()=>onResetAll?onResetAll():update(v=>({...defaults,cardGlassIntensity:v.cardGlassIntensity,profiles:{...defaults.profiles,card:v.profiles.card}}))}>全部恢复默认</Button>}</div>}{!manual&&<p role="status">{{default:'外观偏好不会改变应用内容。',loading:'正在读取已保存的外观…',pending:'有待保存的外观修改',unknown:'保存结果待核实；草稿保留，请先核对原提交。',conflict:'实例外观已变化；草稿保留，请比较后处理。',saving:'正在保存…',saved:'已保存到当前 KSF 实例',failed:'尚未确认保存，请查看实例设置状态；参数仍保留在当前页面。'}[saved]}</p>}</div>
  </div>;
}
