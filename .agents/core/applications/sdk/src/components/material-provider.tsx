import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { MATERIAL_KEY, defaultMaterialSettings, profileNames, readMaterialSettings, shadowCSS, type MaterialSettings } from '../material-settings';
const defaults = defaultMaterialSettings();
export const MaterialContext = createContext({ settings: defaults, update: (_change: (v: MaterialSettings) => MaterialSettings) => {}, saved: 'default' as 'default' | 'saving' | 'saved' | 'failed' });
export const useMaterial = () => useContext(MaterialContext);
export function MaterialProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(() => { try { return readMaterialSettings(localStorage); } catch { return defaultMaterialSettings(); } });
  const [saved, setSaved] = useState<'default' | 'saving' | 'saved' | 'failed'>('default');
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const save = () => { try { localStorage.setItem(MATERIAL_KEY, JSON.stringify(settings)); setSaved('saved'); } catch { setSaved('failed'); } };
    const timer = setTimeout(save, 250);
    window.addEventListener('pagehide', save);
    return () => { clearTimeout(timer); window.removeEventListener('pagehide', save); };
  }, [settings, dirty]);
  const update = (change: (v: MaterialSettings) => MaterialSettings) => { setSettings(change); setDirty(true); setSaved('saving'); };
  return <MaterialContext.Provider value={{ settings, update, saved }}>{children}</MaterialContext.Provider>;
}
export function useMaterialStyle() {
  const { settings } = useMaterial();
  const vars: Record<string, string | number> = { '--scene-wash': settings.backdrop.wash, '--scene-brightness': settings.backdrop.brightness, '--scene-saturation': settings.backdrop.saturation, '--scene-x': `${settings.backdrop.x}%`, '--scene-y': `${settings.backdrop.y}%` };
  for (const id of Object.keys(profileNames) as (keyof typeof profileNames)[]) vars[`--glass-${id}-radius`] = `${settings.profiles[id].radius}px`;
  vars['--glass-reader-shadow'] = shadowCSS(settings.profiles.reader);
  return vars as CSSProperties;
}
