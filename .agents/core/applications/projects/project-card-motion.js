const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function centeredScrollTop(scroller, card, headerHeight) {
  const bounds = scroller.getBoundingClientRect();
  const item = card.getBoundingClientRect();
  const center = bounds.top + (headerHeight + scroller.clientHeight) / 2;
  return clamp(scroller.scrollTop + item.top + item.height / 2 - center, 0, scroller.scrollHeight - scroller.clientHeight);
}

// One hierarchy, one scroller: pointer position pans its contents in the opposite direction.
export function followPointer(board, signal, options = {}) {
  const noMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const list = options.list ?? board.querySelector('.pg-object-tree-list');
  const header = options.header ?? board.querySelector('.pg-object-tree-header');
  const controlSelector = options.controlSelector ?? '.pg-card-select,.pg-project-settings';
  const headerSelector = options.headerSelector ?? '.pg-object-tree-header';
  let returnFrame;
  let browsing = false;
  let pressed = false;
  let leaveAfterPress = false;
  let entryY = null;
  let entryControl = null;
  let paused = [];
  const openProjectMenu = options.openMenu ?? (() => board.querySelector('.pg-project-card-menu:popover-open'));
  const blocked = options.blocked ?? (() => false);
  const clearLean = () => list.style.removeProperty('--card-lean');

  function stopReturns() {
    if (returnFrame !== undefined) cancelAnimationFrame(returnFrame);
    returnFrame = undefined;
  }

  function returnToSelection() {
    stopReturns();
    clearLean();
    if (!board.isConnected || board.scrollHeight <= board.clientHeight) return;
    const selected = options.selection ? options.selection() : board.querySelector('.pg-object-card[data-selected]')
      ?? board.querySelector('.pg-object-card[data-branch]');
    if (!selected) return;
    const start = board.scrollTop;
    const end = centeredScrollTop(board, selected, header?.offsetHeight ?? 0);
    if (noMotion.matches || Math.abs(end - start) <= 1) {
      board.scrollTop = end;
      return;
    }
    const began = performance.now();
    function tick(now) {
      if (!board.isConnected) { stopReturns(); return; }
      const progress = clamp((now - began) / 360, 0, 1);
      board.scrollTop = start + (end - start) * (1 - (1 - progress) ** 3);
      if (progress < 1) returnFrame = requestAnimationFrame(tick);
      else returnFrame = undefined;
    }
    returnFrame = requestAnimationFrame(tick);
  }

  function browse(event) {
    if (event.pointerType !== 'mouse' || event.buttons || pressed || blocked() || openProjectMenu()) return;
    if (event.target.closest(headerSelector)) return;
    const control = event.target.closest(controlSelector);
    if (!browsing || control !== entryControl) {
      // Do not move a different row underneath a pointer entering a clickable cell.
      entryY = control ? event.clientY : null;
      entryControl = control;
      browsing = true;
    }
    if (entryY !== null && Math.abs(event.clientY - entryY) < 4) return;
    entryY = null;
    stopReturns();
    const {top, height} = board.getBoundingClientRect();
    if (!height) return;
    const overflow = board.scrollHeight - board.clientHeight;
    if (overflow > 0) {
      clearLean();
      const edge = Math.min(96, height / 4);
      const progress = clamp((event.clientY - top - edge) / (height - edge * 2), 0, 1);
      board.scrollTop = progress * overflow;
    } else if (!noMotion.matches) {
      const position = clamp((event.clientY - top) / height * 2 - 1, -1, 1);
      list.style.setProperty('--card-lean', (-position * 10).toFixed(1) + 'px');
    }
  }

  board.addEventListener('pointermove', browse, {passive:true, signal});
  board.addEventListener('pointerenter', browse, {passive:true, signal});
  board.addEventListener('pointerleave', event => {
    if (event.pointerType !== 'mouse' || !browsing || blocked() || openProjectMenu()) return;
    if (pressed) leaveAfterPress = true;
    else { browsing = false; entryY = null; entryControl = null; returnToSelection(); }
  }, {passive:true, signal});
  board.addEventListener('scroll', options.onScroll ?? (() => openProjectMenu()?.hidePopover()), {passive:true, signal});
  board.addEventListener('wheel', stopReturns, {passive:true, signal});
  board.addEventListener('focusin', event => {
    const control = event.target.closest(controlSelector);
    if (!control?.matches(':focus-visible')) return;
    stopReturns();
    browsing = false;
    entryY = null;
    entryControl = null;
    clearLean();
    control.scrollIntoView({block:'nearest',inline:'nearest'});
  }, {signal});
  board.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse') return;
    pressed = true;
    stopReturns();
    paused = list.getAnimations().filter(animation => animation.playState === 'running');
    for (const animation of paused) animation.pause();
  }, {signal});
  function release() {
    if (!pressed) return;
    pressed = false;
    for (const animation of paused) if (animation.playState === 'paused' && board.isConnected) animation.play();
    paused = [];
    if (leaveAfterPress && !board.matches(':hover') && !openProjectMenu()) { browsing = false; entryY = null; entryControl = null; returnToSelection(); }
    leaveAfterPress = false;
  }
  window.addEventListener('pointerup', release, {signal});
  window.addEventListener('pointercancel', release, {signal});
  window.addEventListener('blur', release, {signal});
  signal.addEventListener('abort', () => { stopReturns(); clearLean(); }, {once:true});
  return {
    stopReturns,
    resetBrowsing() {
      stopReturns();
      browsing = false;
      entryY = null;
      entryControl = null;
      clearLean();
    }
  };
}
