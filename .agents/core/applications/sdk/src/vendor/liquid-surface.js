// Surface adapter from gentpan/liquidglass components.js v1.0.0, MIT.
// Commit 068ad226f53e1ca62d857f78bdc32f58f3c5fce7. No component registration or CSS injection.
// Adaptation: cap maps at 1280px, scoped read/write batches, defer resize maps, observe PC pane shifts.
import { createGlass, engine } from './liquid-glass.js';
import { createSurfaceScheduler } from './surface-scheduler.js';

function el(tag, className, attrs) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

function place(node, x, y, w, h, r) {
  node.style.width = `${w}px`;
  node.style.height = `${h}px`;
  node.style.borderRadius = `${r}px`;
  node.style.transform = `translate(${x}px, ${y}px)`;
}

function resolveBackdrop(host) {
  const selector = host.getAttribute('backdrop');
  if (selector === 'none') return null;
  if (selector) return document.querySelector(selector);
  const scope = host.parentElement?.closest('[data-lg-backdrop]');
  if (!scope) return null;
  const inner = scope.getAttribute('data-lg-backdrop');
  return inner ? scope.querySelector(inner) : scope;
}

// A decorative copy of the backdrop: an <img> is cloned, anything else contributes its CSS background.
function cloneBackdrop(source) {
  let copy;
  if (source instanceof HTMLImageElement) {
    copy = source.cloneNode(false);
    copy.removeAttribute('id');
    copy.removeAttribute('class');
    copy.removeAttribute('data-lg-backdrop');
    copy.alt = '';
    copy.loading = 'eager';
    const cs = getComputedStyle(source);
    copy.style.objectFit = cs.objectFit;
    copy.style.objectPosition = cs.objectPosition;
  } else {
    copy = document.createElement('span');
    const cs = getComputedStyle(source);
    for (const k of ['backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat', 'backgroundOrigin', 'backgroundClip', 'filter']) {
      copy.style[k] = cs[k];
    }
  }
  copy.classList.add('lg-surface__copy');
  copy.setAttribute('aria-hidden', 'true');
  return copy;
}

const surfaces = new Set();
const resizing = new Set();
const scheduler = createSurfaceScheduler(surfaces, callback => requestAnimationFrame(callback));
export function requestSync(scope) {
  const root = scope instanceof Element ? scope : null;
  scheduler.sync(root);
}
export function setGlassInteracting(root, active) {
  if (!root || !scheduler.suspend(root, active)) return;
  root.toggleAttribute('data-glass-interacting', active);
}
export function setGlassResizing(root, active) {
  if (!root) return;
  const wasResizing = resizing.has(root);
  root.toggleAttribute?.('data-glass-resizing', active);
  if (active) resizing.add(root); else resizing.delete(root);
  // Set before the first ResizeObserver callback can request a new map.
  for (const s of surfaces) if (root.contains(s.host)) s.glass?.update({ deferMap: active });
  requestSync(root);
  if (!active && wasResizing) root.dispatchEvent(new Event('ksf:glass-resize-end'));
}
export function isGlassResizing(root) { return !!root && (!!root.closest?.('[data-glass-resizing]') || [...resizing].some(scope => scope.contains(root))); }
if (typeof window !== 'undefined') {
  // A reader scroll does not move glass outside that reader.
  addEventListener('scroll', event => requestSync(event.target), { capture: true, passive: true });
  addEventListener('resize', () => requestSync());
}

/**
 * Glass body for `host` (which must be position: relative). Modes:
 *   copy     — an aligned copy of the backdrop image, refracted with filter: url(). Every engine.
 *   backdrop — backdrop-filter: url(). Chromium only.
 *   fallback — backdrop-filter blur, for WebKit/Gecko with no known backdrop.
 */
export class Surface {
  constructor(host, { radius = 16, bleed = 16, optics: o = {}, owner = host } = {}) {
    this.host = host;
    this.owner = owner; // element carrying the backdrop attribute
    this.radius = radius;
    this.bleed = bleed;
    this.optics = o;
    this.delta = { x: 0, y: 0, w: 0, h: 0 };
    this.root = el('span', 'lg-surface', { 'aria-hidden': 'true' });
    this.root.style.setProperty('--lg-bleed', `${bleed}px`);
    this.shadow = el('span', 'lg-surface__shadow');
    this.layer = el('span', 'lg-surface__glass');
    this.tint = el('span', 'lg-surface__tint');
    this.root.append(this.shadow, this.layer, this.tint);
    host.prepend(this.root);
  }

  attach() {
    this.source = resolveBackdrop(this.owner);
    if (this.source) {
      this.mode = 'copy';
      this.copy = cloneBackdrop(this.source);
      this.layer.replaceChildren(this.copy);
      this.glass = createGlass(this.layer, { ...this.optics, clip: true });
      if (this.source instanceof HTMLImageElement && !this.source.complete) this.source.addEventListener('load', this.onLoad = () => this.update(), { once: true });
    } else if (engine === 'blink') {
      this.mode = 'backdrop';
      this.glass = createGlass(this.layer, { ...this.optics, chroma: 0, mode: 'backdrop', clip: true });
    } else {
      this.mode = 'fallback';
      this.layer.classList.add('lg-surface__glass--fallback');
    }
    this.observer = new ResizeObserver(() => this.update());
    this.observer.observe(this.host);
    // A sibling pane can move a fixed-size control without resizing that control.
    for (let pane = this.host.parentElement; pane; pane = pane.parentElement) {
      if (pane.matches('.sidebar, .workspace, .round-sidebar, .round-workspace, .sheet, .os-window, .desktop-widget')) this.observer.observe(pane);
    }
    surfaces.add(this);
    this.update();
  }

  detach() {
    this.glass?.destroy();
    this.glass = null;
    this.observer?.disconnect();
    if (this.onLoad) this.source?.removeEventListener('load', this.onLoad);
    surfaces.delete(this); scheduler.cancel(this);
    this.layer.classList.remove('lg-surface__glass--fallback');
    this.layer.removeAttribute('style');
    this.layer.replaceChildren();
    this.copy = null;
    this.mode = null;
    this.delta = { x: 0, y: 0, w: 0, h: 0 };
    this.lastKey = this.alignKey = null;
  }

  /** Grow/shift the glass relative to the host box (press squish, open animations). */
  setDelta(d) {
    Object.assign(this.delta, d);
    this.update();
  }

  // Product tuning updates existing filters/copies without replacing native controls.
  setOptics(optics, radius) {
    this.optics = optics;
    this.radius = radius;
    this.glass?.update(this.mode === 'backdrop' ? { ...optics, chroma: 0 } : optics);
    this.update();
  }

  refreshBackdrop() {
    if (this.mode !== 'copy' || !this.copy || this.source instanceof HTMLImageElement) return;
    const cs = getComputedStyle(this.source);
    for (const key of ['backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat', 'filter']) this.copy.style[key] = cs[key];
    this.alignKey = null;
    this.update();
  }

  update() { scheduler.enqueue(this); }

  measure(sources) {
    const W = this.host.offsetWidth, H = this.host.offsetHeight;
    let alignment = null;
    if (W && H && this.mode === 'copy') {
      let sr = sources.get(this.source);
      if (!sr) { sr = this.source.getBoundingClientRect(); sources.set(this.source, sr); }
      const lr = this.layer.getBoundingClientRect();
      alignment = { width: sr.width, height: sr.height, x: sr.left - lr.left, y: sr.top - lr.top };
    }
    return { W, H, alignment, deferMap: [...resizing].some(root => root.contains(this.host)) };
  }

  apply({ W, H, alignment, deferMap }) {
    if (!W || !H) { this.glass?.update({ hidden: true }); return; }
    this.glass?.update({ hidden: false, deferMap });
    const d = this.delta;
    const x = this.bleed + d.x;
    const y = this.bleed + d.y;
    const w = Math.max(1, W + d.w);
    const h = Math.max(1, H + d.h);
    const r = Math.min(this.radius, w / 2, h / 2);
    const mapScale = Math.min(devicePixelRatio || 1, 2, 1280 / Math.max(W + 2 * this.bleed, H + 2 * this.bleed));
    const key = `${x}|${y}|${w}|${h}|${r}|${mapScale}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      place(this.shadow, x, y, w, h, r);
      place(this.tint, x, y, w, h, r);
      if (this.mode === 'fallback') place(this.layer, x, y, w, h, r);
      else this.glass?.update({ x, y, width: w, height: h, radius: r, mapScale });
    }
    if (alignment) this.align(alignment);
  }

  // Keep the backdrop copy registered with the real backdrop. Scrolling usually moves both together,
  // so most calls change nothing and write nothing.
  align({ width, height, x, y }) {
    const key = `${width}|${height}|${x}|${y}`;
    if (key === this.alignKey) return;
    this.alignKey = key;
    this.copy.style.width = `${width}px`;
    this.copy.style.height = `${height}px`;
    this.copy.style.transform = `translate(${x}px, ${y}px)`;
  }
}
