import { useEffect, useRef, type CSSProperties } from 'react';
import { Surface } from '../vendor/liquid-surface';
import { createSpring } from '../vendor/liquid-glass';
import { shadowCSS, tintColor, type ProfileId } from '../material-settings';
import { useMaterial } from './material-provider';
import { useWindowContext } from '../window-context';
type Props = { mode?: 'wallpaper' | 'frost'; variant?: 'panel' | 'selection' | 'button'; profile?: ProfileId; blur?: number; strength?: number; backdrop?: string };
// Application content uses solid surfaces. No controller, observer or filter is mounted.
export function GlassSurface(props: Props) {
  const { id } = useWindowContext();
  return id === 'standalone' ? <RefractiveSurface {...props} /> : null;
}
function RefractiveSurface({ mode = 'wallpaper', variant = 'panel', profile: id, blur, strength, backdrop = '.workbench-backdrop' }: Props) {
  const { settings } = useMaterial();
  const profile = settings.profiles[id ?? (mode === 'frost' ? 'drawer' : variant === 'button' ? 'button' : variant === 'selection' ? 'chat' : 'directory')];
  const host = useRef<HTMLSpanElement>(null), surfaceRef = useRef<Surface | null>(null);
  const current = useRef(profile); current.current = profile;
  const optics = { refraction: strength ?? profile.refraction, bezel: profile.bezel, curvature: profile.curvature, ior: profile.ior, invert: profile.invert, chroma: mode === 'frost' ? 0 : profile.chroma, blur: blur ?? profile.blur, specular: profile.specular, specularWidth: profile.specularWidth, lightAngle: profile.lightAngle };
  const opticsRef = useRef(optics); opticsRef.current = optics;
  useEffect(() => {
    const node = host.current, parent = node?.parentElement;
    if (!node || !parent) return;
    node.setAttribute('backdrop', mode === 'wallpaper' ? backdrop : 'none');
    const surface = new Surface(node, { owner: node, radius: current.current.radius, bleed: 28, optics: opticsRef.current });
    surfaceRef.current = surface;
    const transparency = matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let attached = false;
    const sync = () => {
      surface.detach(); attached = false;
      node.classList.toggle('glass-reduced', transparency.matches);
      if (!transparency.matches) { surface.attach(); attached = true; }
    };
    const spring = createSpring(0, value => {
      if (!attached) return;
      const { grow, squash } = current.current;
      surface.setDelta({ x: -grow * value / 2, y: squash * value / 2, w: grow * value, h: -squash * value });
    }, { stiffness: profile.stiffness, damping: profile.damping });
    const events = new AbortController();
    const press = () => { if (!parent.matches(':disabled') && !motion.matches && settings.motion) spring.set(1); };
    const release = () => spring.set(0);
    if (parent instanceof HTMLButtonElement) {
      parent.addEventListener('pointerdown', press, { signal: events.signal });
      for (const type of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) parent.addEventListener(type, release, { signal: events.signal });
      parent.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') press(); }, { signal: events.signal });
      parent.addEventListener('keyup', release, { signal: events.signal });
    }
    const stopMotion = () => { if (motion.matches) spring.set(0, { immediate: true }); };
    transparency.addEventListener('change', sync); motion.addEventListener('change', stopMotion);
    sync();
    return () => { events.abort(); spring.stop(); transparency.removeEventListener('change', sync); motion.removeEventListener('change', stopMotion); surface.detach(); surface.root.remove(); surfaceRef.current = null; };
  }, [mode, variant, backdrop, profile.stiffness, profile.damping, settings.motion]);
  useEffect(() => { surfaceRef.current?.setOptics(opticsRef.current, profile.radius); }, [profile, blur, strength]);
  useEffect(() => { surfaceRef.current?.refreshBackdrop(); }, [settings.backdrop]);
  const style = { '--lg-tint': tintColor(profile), '--lg-shadow-2': shadowCSS(profile), '--lg-fallback': `blur(${profile.blur}px) saturate(1.6)` } as CSSProperties;
  return <span ref={host} style={style} className={`glass-surface glass-${variant}`} data-glass-profile={id ?? (variant === 'button' ? 'button' : 'directory')} aria-hidden="true" />;
}
