import { useId, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { backdropLimits, bounded, defaultMaterialSettings, profileLimits, profileNames, type BackdropSettings, type MaterialProfile, type ProfileId } from '../material-settings';
import { useMaterial } from './material-provider';
import { Button } from './ui/button';
import { DrawerMaterialPreview } from './drawer-material-preview';
type NumberKey = keyof typeof profileLimits;
function Range({ label, value, limits, unit = '', scale, onChange, hint }: { label: string; value: number; limits: readonly [number, number, number]; unit?: string; scale?: number; onChange: (n: number) => void; hint?: string }) {
  const id = useId(), factor = scale ?? (unit === '%' ? 100 : 1), displayed = Number((value * factor).toFixed(2));
  return <div className="material-range"><div><label htmlFor={id}>{label}</label><span className="material-number"><input aria-label={`${label}数值`} type="number" min={limits[0] * factor} max={limits[1] * factor} step={limits[2] * factor} value={displayed} onChange={e => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) onChange(bounded(e.target.valueAsNumber / factor, limits)); }} /><span>{unit}</span></span></div><input id={id} type="range" min={limits[0]} max={limits[1]} step={limits[2]} value={value} aria-valuetext={`${displayed}${unit}`} onChange={e => onChange(e.target.valueAsNumber)} />{hint && <small>{hint}</small>}</div>;
}
export function MaterialSettingsContent() {
  const { settings, update, saved } = useMaterial();
  const [target, setTarget] = useState<ProfileId | 'backdrop'>('card');
  const profile = target === 'backdrop' ? null : settings.profiles[target];
  function change<K extends keyof MaterialProfile>(key: K, value: MaterialProfile[K]) { if (target !== 'backdrop') update(v => ({ ...v, profiles: { ...v.profiles, [target]: { ...v.profiles[target], [key]: value } } })); }
  const range = (key: NumberKey, label: string, unit = '', hint?: string) => profile && <Range key={key} label={label} value={profile[key]} limits={profileLimits[key]} unit={unit} hint={hint} onChange={n => change(key, n)} />;
  function resetCurrent() { const defaults = defaultMaterialSettings(); update(v => target === 'backdrop' ? { ...v, backdrop: defaults.backdrop } : { ...v, profiles: { ...v.profiles, [target]: defaults.profiles[target] } }); }
  return <div className="material-settings-inline"><p className="settings-description">调整即预览，自动保存到当前 KSF 实例。</p>
    <div className="material-settings-top"><label htmlFor="material-target">调整对象</label><select id="material-target" value={target} onChange={e => setTarget(e.target.value as typeof target)}><option value="backdrop">雪山背景</option>{Object.entries(profileNames).filter(([id]) => ['card', 'dock', 'statusbar', 'button', 'drawer'].includes(id)).map(([id, name]) => <option key={id} value={id}>{id === 'drawer' ? '桌面系统抽屉' : id === 'button' ? '桌面操作按钮' : name}</option>)}</select></div>
    {target === 'drawer' && <DrawerMaterialPreview inline />}
    <div className="material-settings-content" key={target}>{profile ? <>
      <p className="material-object-note">{target === 'reader' ? '直接调整当前轮次的标题栏、章节栏及请求／路由／结果背景。默认不透明，降低色层不透明度可看到玻璃效果；文字始终保持清晰。' : target === 'workspace' ? '调整轮次列表和工作台外层背景。中央正文卡片请选“主阅读区”。' : target === 'drawer' ? '作用于桌面的采集与诊断等系统抽屉；应用内来源和目录抽屉保持实色。上方示例实时预览材质；设置内容保持实色，便于调整和恢复。' : target === 'section' ? '控制“请求／路由／结果”的滑动透镜。标签保持原生操作，装饰副本关闭色散。' : '桌面材质独立调整。应用窗口及其内容已使用实色表面。'} </p>
      <div className="material-color"><label htmlFor="material-tint">玻璃染色</label><input id="material-tint" type="color" value={profile.tint} onChange={e => change('tint', e.target.value)} /><code>{profile.tint}</code></div>
      {range('opacity', '色层不透明度', '%', '越低越通透，背景也会更明显。')}
      {target !== 'drawer' && range('refraction', '边缘折射', 'px')}{range('blur', '磨砂模糊', 'px')}
      {target !== 'drawer' && <>{range('bezel', '弧面范围', '%')}{range('specular', '边缘高光', '%')}</>}
      {range('radius', '圆角', 'px')}{range('shadowOpacity', '阴影强度', '%')}
      <details className="material-advanced"><summary>更多参数</summary><div>
        {target !== 'drawer' && <>{range('curvature', '表面曲率')}{range('ior', '折射率')}{target !== 'section' && range('chroma', '边缘色散', '%')}{range('specularWidth', '高光宽度', 'px')}{range('lightAngle', '光照角度', '°')}<label className="material-check"><input type="checkbox" role="switch" checked={profile.invert} onChange={e => change('invert', e.target.checked)} />凹面透镜</label></>}
        {range('shadowBlur', '阴影柔化', 'px')}{range('shadowY', '阴影下移', 'px')}
        {['chat', 'round', 'button', 'section'].includes(target) && <><h3>{target === 'section' ? '切换动效' : '按压与回弹'}</h3>{target === 'section' ? range('stretch', '移动拉伸', 'px') : <>{range('grow', '按压增宽', 'px')}{range('squash', '按压压低', 'px')}</>}{range('stiffness', '弹簧刚度')}{range('damping', '弹簧阻尼')}</>}
      </div></details>
    </> : <><p className="material-object-note">控制原有雪山背景的显现程度、色彩和构图，不改变图片原件。</p>{(['wash', 'brightness', 'saturation', 'x', 'y'] as (keyof BackdropSettings)[]).map(key => <Range key={key} label={{ wash: '冷白遮罩', brightness: '图片亮度', saturation: '图片饱和度', x: '水平位置', y: '垂直位置' }[key]} value={settings.backdrop[key]} limits={backdropLimits[key]} unit="%" scale={['x', 'y'].includes(key) ? 1 : 100} onChange={n => update(v => ({ ...v, backdrop: { ...v.backdrop, [key]: n } }))} />)}</>}
    </div>
    <div className="material-settings-bottom"><label className="material-check"><input type="checkbox" role="switch" checked={settings.motion} onChange={e => update(v => ({ ...v, motion: e.target.checked }))} />启用液态动效</label><small>系统的减少动态效果、减少透明度和高对比度偏好优先。</small><div><Button variant="outline" onClick={resetCurrent}><RotateCcw size={13} />重置当前对象</Button><Button variant="ghost" onClick={() => update(() => defaultMaterialSettings())}>全部恢复默认</Button></div><p role="status">{{ default: '仅保存材质与显示偏好，不影响对话内容。', saving: '正在保存…', saved: '已保存到当前 KSF 实例', failed: '尚未确认保存，请查看实例设置状态；参数仍保留在当前页面。' }[saved]}</p></div>
  </div>;
}
