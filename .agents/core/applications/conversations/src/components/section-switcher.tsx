import { useEffect, useRef, type ReactNode } from 'react';
import { createGlass, createSpring } from '@ksf/sdk/vendor/liquid-glass';
import { useWindowContext } from '@ksf/sdk/window-context';
import { useMaterial } from '@ksf/sdk/components/material-provider';
import { shadowCSS, tintColor } from '@ksf/sdk/material-settings';

// Pattern B from the installed skill: only these known UI labels are copied, never archive content.
// Native document-navigation buttons keep their original ARIA, events and focus behavior.
type Props = { active: string; children: ReactNode };
export function SectionSwitcher(props: Props) {
  const { id } = useWindowContext();
  return id === 'standalone' ? <RefractiveSectionSwitcher {...props} /> : <div className="section-switcher section-static">{props.children}</div>;
}
function RefractiveSectionSwitcher({ active, children }: Props) {
  const { settings } = useMaterial(), profile = settings.profiles.section;
  const currentProfile = useRef(profile); currentProfile.current = profile;
  const tune = useRef<() => void>(() => {});
  const root = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLSpanElement>(null);
  const shadow = useRef<HTMLSpanElement>(null);
  const select = useRef<() => void>(() => {});
  useEffect(() => {
    const host = root.current, refract = copy.current, rim = shadow.current;
    if (!host || !refract || !rim) return;
    const buttons = [...host.querySelectorAll<HTMLButtonElement>(':scope > button')];
    const reduced = matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let glass: ReturnType<typeof createGlass> | undefined, x = 0, velocity = 0;
    const current = () => buttons.find(b => b.hasAttribute('aria-current')) ?? buttons[0];
    const render = () => {
      const selected = current(); if (!selected) return;
      const lefts = buttons.map(b => b.offsetLeft);
      let index = 0; while (index < buttons.length - 2 && x > lefts[index + 1]) index++;
      const fraction = Math.max(0, Math.min(1, (x - lefts[index]) / ((lefts[index + 1] ?? lefts[index]) - lefts[index] || 1)));
      const baseWidth = buttons[index].offsetWidth + ((buttons[index + 1]?.offsetWidth ?? buttons[index].offsetWidth) - buttons[index].offsetWidth) * fraction;
      const p = currentProfile.current;
      const stretch = Math.min(p.stretch, Math.abs(velocity) * .02);
      const width = baseWidth + stretch, height = selected.offsetHeight - stretch * .25;
      const left = x - stretch / 2, top = selected.offsetTop + (selected.offsetHeight - height) / 2;
      const radius = Math.min(p.radius, height / 2);
      glass?.update({ x: left, y: top, width, height, radius });
      refract.style.background = tintColor(p);
      Object.assign(rim.style, { width: `${width}px`, height: `${height}px`, borderRadius: `${radius}px`, transform: `translate(${left}px,${top}px)`, boxShadow: shadowCSS(p) });
    };
    const spring = createSpring(current()?.offsetLeft ?? 0, (value, speed) => { x = value; velocity = speed; render(); }, { stiffness: profile.stiffness, damping: profile.damping });
    const refresh = () => {
      refract.replaceChildren(...buttons.map(button => {
        const label = document.createElement('span'); label.className = 'section-copy-option';
        label.append(...[...button.childNodes].map(node => node.cloneNode(true)));
        label.style.width = `${button.offsetWidth}px`; label.style.height = `${button.offsetHeight}px`;
        return label;
      }));
      const selected = current(); if (selected) spring.set(selected.offsetLeft, { immediate: true });
    };
    const setup = () => {
      glass?.destroy(); glass = undefined;
      host.classList.toggle('section-solid', reduced.matches);
      if (!reduced.matches) glass = createGlass(refract, { ...currentProfile.current, chroma: 0, clip: true });
      refresh();
    };
    const resize = new ResizeObserver(refresh); resize.observe(host); buttons.forEach(b => resize.observe(b));
    const text = new MutationObserver(refresh);
    buttons.forEach(b => text.observe(b, { childList: true, subtree: true, characterData: true }));
    select.current = () => { const selected = current(); if (selected) spring.set(selected.offsetLeft, { immediate: !settings.motion }); };
    tune.current = () => { glass?.update({ ...currentProfile.current, chroma: 0 }); render(); };
    const stopMotion = () => { const selected = current(); if (motion.matches && selected) spring.set(selected.offsetLeft, { immediate: true }); };
    reduced.addEventListener('change', setup); motion.addEventListener('change', stopMotion); setup();
    return () => { resize.disconnect(); text.disconnect(); reduced.removeEventListener('change', setup); motion.removeEventListener('change', stopMotion); spring.stop(); glass?.destroy(); select.current = () => {}; tune.current = () => {}; };
  }, [profile.stiffness, profile.damping, settings.motion]);
  useEffect(() => tune.current(), [profile]);
  useEffect(() => select.current(), [active]);
  return <div className="section-switcher" ref={root}>{children}<span ref={copy} className="section-copy" aria-hidden="true" /><span ref={shadow} className="section-lens" aria-hidden="true" /></div>;
}
