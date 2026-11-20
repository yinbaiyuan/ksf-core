import {useEffect, useRef, useState} from 'react';
import {useWindowContext} from './window-context';

/** Own-document lifecycle: continuous effects stop offscreen, hidden, blurred or reduced. */
export function useMotionActivity<T extends HTMLElement>({respectReducedMotion = true, enabled = true}: {respectReducedMotion?: boolean; enabled?: boolean} = {}) {
  const ref = useRef<T>(null), [active, setActive] = useState(false), context = useWindowContext();
  useEffect(() => {
    const node = ref.current, view = node?.ownerDocument.defaultView;
    if (!enabled || !node || !view) return;
    const doc = node.ownerDocument, reduce = view.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true, focused = true;
    const update = () => setActive(visible && focused && !doc.hidden && (!respectReducedMotion || !reduce.matches));
    const blur = () => {focused = false; update();}, focus = () => {focused = true; update();};
    const observer = new view.IntersectionObserver(entries => {visible = entries[0]?.isIntersecting ?? false; update();});
    observer.observe(node); update();
    doc.addEventListener('visibilitychange', update); reduce.addEventListener('change', update);
    view.addEventListener('blur', blur); view.addEventListener('focus', focus);
    return () => {observer.disconnect(); doc.removeEventListener('visibilitychange', update); reduce.removeEventListener('change', update); view.removeEventListener('blur', blur); view.removeEventListener('focus', focus);};
  }, [respectReducedMotion, enabled]);
  return {ref, active: enabled && active && context.active && context.enabled};
}
