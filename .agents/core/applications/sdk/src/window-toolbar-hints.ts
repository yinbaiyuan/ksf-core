/** Shared window chrome enhancement. No app-specific labels or action IDs. */
let nextHint = 0;
export function installWindowToolbarHints(root: HTMLElement) {
  const doc = root.ownerDocument, view = doc.defaultView;
  if (!view || root.hasAttribute('data-ksf-toolbar-hints')) return () => {};
  root.setAttribute('data-ksf-toolbar-hints', '');
  const id = `ksf-window-command-hint-${++nextHint}`;
  const titles = new Map<HTMLElement, string>();
  let current: HTMLElement | null = null, hint: HTMLDivElement | null = null;
  let pending = 0, leaving = 0, warmUntil = 0, keyboard = true;
  const owned = (node: HTMLElement) => root.contains(node) && node.closest('[data-ksf-toolbar-hints]') === root;
  const target = (node: EventTarget | null): HTMLElement | null => {
    if (!(node instanceof view.Element)) return null;
    const button = node.closest<HTMLElement>('button') ?? node.closest('label')?.querySelector<HTMLElement>('input[type="radio"]') ?? null;
    return button && owned(button) && !button.closest('.ksf-tooltip-trigger,[role="menu"],.window-command-menu') ? button : null;
  };
  const clearTimers = () => { view.clearTimeout(pending); view.clearTimeout(leaving); };
  const hide = () => {
    clearTimers();
    if (current) {
      const described = current.getAttribute('aria-describedby')?.split(/\s+/).filter(value => value !== id).join(' ');
      if (described) current.setAttribute('aria-describedby', described); else current.removeAttribute('aria-describedby');
    }
    hint?.remove(); hint = null; current = null;
  };
  const readTitle = (element: HTMLElement) => {
    if (!owned(element)) return;
    const value = element.getAttribute('title');
    if (value) { titles.set(element, value); element.removeAttribute('title'); }
  };
  const scan = () => {
    for (const element of titles.keys()) if (!root.contains(element)) titles.delete(element);
    root.querySelectorAll<HTMLElement>('button[title],.ksf-segmented [title]').forEach(readTitle);
  };
  const text = (element: HTMLElement) => {
    const label = element.getAttribute('aria-label') ?? element.closest('label')?.textContent?.trim() ?? element.textContent?.trim() ?? '';
    const title = titles.get(element), shortcut = element.getAttribute('aria-keyshortcuts');
    const base = title || (label + (shortcut ? `（${shortcut}）` : ''));
    const state = element.getAttribute('aria-busy') === 'true' ? '处理中' : element.getAttribute('aria-pressed') === 'true' || element.getAttribute('aria-checked') === 'true' || (element instanceof view.HTMLInputElement && element.checked) ? '已选中' : element.matches(':disabled,[aria-disabled="true"]') ? '暂不可用' : '';
    return base + (state ? ` · ${state}` : '');
  };
  const position = () => {
    if (!hint || !current) return;
    const rect = current.getBoundingClientRect(), size = hint.getBoundingClientRect();
    hint.style.left = `${Math.max(8, Math.min(view.innerWidth - size.width - 8, rect.left + (rect.width - size.width) / 2))}px`;
    hint.style.top = `${Math.max(8, rect.bottom + size.height + 12 < view.innerHeight ? rect.bottom + 8 : rect.top - size.height - 8)}px`;
  };
  const show = (element: HTMLElement) => {
    hide();
    if (!element.isConnected || element.closest('[inert],[hidden]') || !element.getClientRects().length) return;
    readTitle(element);
    const message = text(element); if (!message) return;
    current = element; hint = doc.createElement('div');
    hint.id = id; hint.className = ['ksf-window-toolbar-hint', ...[...root.classList].filter(value=>value.startsWith('ksf-app-'))].join(' '); hint.setAttribute('role', 'tooltip'); hint.textContent = message;
    hint.addEventListener('pointerenter', () => view.clearTimeout(leaving));
    hint.addEventListener('pointerleave', () => { leaving = view.setTimeout(hide, 100); });
    doc.body.appendChild(hint);
    element.setAttribute('aria-describedby', [...new Set([...(element.getAttribute('aria-describedby')?.split(/\s+/) ?? []), id])].join(' '));
    warmUntil = Date.now() + 1000; position();
  };
  const over = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    const element = target(event.target); if (!element || element === current) return;
    const warm = !!hint || Date.now() < warmUntil;
    hide(); pending = view.setTimeout(() => show(element), warm ? 0 : 300);
  };
  const out = (event: PointerEvent) => {
    if (target(event.relatedTarget) === current || event.relatedTarget instanceof view.Node && hint?.contains(event.relatedTarget)) return;
    view.clearTimeout(pending); leaving = view.setTimeout(hide, 100);
  };
  const focus = (event: FocusEvent) => { const element = target(event.target); if (keyboard && element) show(element); };
  const blur = (event: FocusEvent) => { if (target(event.relatedTarget) !== current) hide(); };
  const key = (event: KeyboardEvent) => { keyboard = true; if (event.key === 'Escape') hide(); };
  const down = () => { keyboard = false; hide(); };
  const observer = new view.MutationObserver(() => { scan(); if (hint && current) { hint.textContent = text(current); position(); } });
  observer.observe(root, {subtree:true, childList:true, attributes:true, attributeFilter:['title','aria-pressed','aria-checked','aria-busy','disabled','checked','data-selected']});
  scan(); root.addEventListener('pointerover', over); root.addEventListener('pointerout', out);
  root.addEventListener('focusin', focus); root.addEventListener('focusout', blur); root.addEventListener('pointerdown', down);
  doc.addEventListener('keydown', key, true); doc.addEventListener('scroll', hide, true); view.addEventListener('resize', hide);
  return () => {
    hide(); observer.disconnect(); root.removeAttribute('data-ksf-toolbar-hints');
    root.removeEventListener('pointerover', over); root.removeEventListener('pointerout', out);
    root.removeEventListener('focusin', focus); root.removeEventListener('focusout', blur); root.removeEventListener('pointerdown', down);
    doc.removeEventListener('keydown', key, true); doc.removeEventListener('scroll', hide, true); view.removeEventListener('resize', hide);
    for (const [element, value] of titles) if (!element.hasAttribute('title')) element.setAttribute('title', value);
  };
}
