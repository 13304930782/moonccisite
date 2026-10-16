import { animate, motionValue } from 'motion';
import { motionDesign } from './motionDesign';
import { reducedMotion } from './motionPreference';

const selector = '[data-slot=dialog-content],[data-slot=dialog-overlay],[data-slot=alert-dialog-content],[data-slot=alert-dialog-overlay],[data-slot=sheet-content],[data-slot=sheet-overlay],[data-slot=dropdown-menu-content],[data-slot=dropdown-menu-sub-content],[data-slot=context-menu-content],[data-slot=popover-content],.article-media-dialog,.article-modal-overlay,.cover-framing-dialog,.cover-framing-overlay,.rs-panel,.rs-overlay,.header-search,.m-panel,.m-backdrop,.nav-popover';
type Surface = {
  node: HTMLElement; key: string; value: ReturnType<typeof motionValue<number>>;
  alpha: ReturnType<typeof motionValue<number>>; stop: () => void; unsubscribe: () => void; measureStop: () => void; rect: DOMRect; css: string;
  x: number; y: number; scale: number; origin: string; originStyle: string; transform: string; ancestors: string[];
};

// Exits are inert visual snapshots: Radix releases focus/scroll/pointer ownership immediately.
export function installSurfaceMotion(doc = document) {
  const active = new Map<HTMLElement, Surface>(), exits = new Map<string, Surface>();
  const pending = new Map<HTMLElement, number>();
  let source: HTMLElement | null = null;
  const sourceEvent = (event: Event) => { refresh(); if (event.target instanceof Element) source = event.target.closest<HTMLElement>('button,a,summary,[role=button]'); };
  const visible = (node: HTMLElement) => node.isConnected && node.dataset.motionReady !== 'false' && node.getAttribute('data-state') !== 'closed' && !node.closest('[data-motion-presentation],details:not([open])') && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  function refreshSurface(state: Surface) {
    if (visible(state.node) && Math.abs(state.value.get() - 1) < .0001) {
      state.rect = state.node.getBoundingClientRect();
      const style = getComputedStyle(state.node);
      state.css = Array.from(style).map(property => `${property}:${style.getPropertyValue(property)};`).join('');
    }
  }
  function refresh() { active.forEach(refreshSurface); }
  function paint(state: Surface, progress: number) {
    const rest = 1 - progress;
    state.node.style.transform = `${state.transform} translate3d(${state.x * rest}px,${state.y * rest}px,0) scale(${1 - (1 - state.scale) * rest})`;
  }
  function dispose(state: Surface) { state.stop(); state.unsubscribe(); state.measureStop(); }
  function enter(node: HTMLElement) {
    pending.delete(node);
    if (reducedMotion() || typeof node.animate !== 'function') { node.style.opacity = '1'; return; }
    if (!visible(node)) { node.style.opacity = '1'; return; }
    if (active.has(node) || node.dataset.motionSurface === 'image') return;
    const rect = node.getBoundingClientRect(), style = getComputedStyle(node), slot = node.dataset.slot || node.classList[0];
    const key = node.dataset.motionKey || `${slot}:${node.className}`;
    const previous = exits.get(key), value = previous?.value || motionValue(0), alpha = previous?.alpha || motionValue(0);
    if (previous) { dispose(previous); previous.node.remove(); exits.delete(key); }
    let x = 0, y = 10, scale = .965, origin = style.transformOrigin;
    const side = node.dataset.motionSide || (slot === 'sheet-content' ? 'right' : node.dataset.layout === 'sheet' ? 'bottom' : node.dataset.side);
    if (slot?.endsWith('-overlay') || node.matches('.m-backdrop,.article-modal-overlay,.cover-framing-overlay,.rs-overlay')) { y = 0; scale = 1; }
    else if (side) {
      x = side === 'left' ? -10 : side === 'right' ? 10 : 0;
      y = side === 'top' ? -8 : side === 'bottom' ? 8 : 0;
      scale = .95;
      if (slot === 'sheet-content' || node.dataset.motionSide || node.dataset.layout === 'sheet') { x *= 6; y *= 6; scale = 1; }
    } else if (node.matches('.m-panel,.header-search')) { y = -16; scale = .985; origin = '50% 0'; }
    else if (node.matches('.nav-popover')) { y = -6; scale = .95; origin = '90% 0'; }
    else if (rect.width > innerWidth * .9 && Math.abs(rect.bottom - innerHeight) < 4) { y = 44; scale = 1; origin = '50% 100%'; }
    else if (source?.isConnected) {
      const from = source.getBoundingClientRect(), cx = from.left + from.width / 2, cy = from.top + from.height / 2;
      x = Math.max(-12, Math.min(12, (cx - rect.left - rect.width / 2) * .08));
      y = Math.max(-18, Math.min(18, (cy - rect.top - rect.height / 2) * .08));
      origin = `${Math.max(0, Math.min(rect.width, cx - rect.left))}px ${Math.max(0, Math.min(rect.height, cy - rect.top))}px`;
    }
    const css = Array.from(style).map(property => `${property}:${style.getPropertyValue(property)};`).join('');
    const ancestors: string[] = [];
    for (let parent = node.parentElement; parent && parent !== doc.body; parent = parent.parentElement) ancestors.unshift(parent.className);
    const state: Surface = { node, key, value, alpha, rect, css, x, y, scale, origin, originStyle: node.style.transformOrigin, ancestors, transform: style.transform === 'none' ? '' : style.transform, stop: () => {}, unsubscribe: () => {}, measureStop: () => {} };
    const measure = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => refreshSurface(state)); measure?.observe(node); state.measureStop = () => measure?.disconnect();
    active.set(node, state); node.style.transformOrigin = origin;
    const stopMove = value.on('change', n => paint(state, n)), stopFade = alpha.on('change', n => { node.style.opacity = String(n); });
    state.unsubscribe = () => { stopMove(); stopFade(); }; paint(state, value.get()); node.style.opacity = String(alpha.get());
    const movement = animate(value, 1, motionDesign.surfaceSpring);
    const fade = animate(alpha, 1, motionDesign.opacity);
    state.stop = () => { movement.stop(); fade.stop(); };
    movement.then(() => { if (active.get(node) === state) node.style.transform = state.transform; });
  }
  function schedule(node: HTMLElement) {
    if (reducedMotion() || typeof node.animate !== 'function' || node.dataset.motionSurface === 'image' || !visible(node) || active.has(node) || pending.has(node)) return;
    node.dataset.motionSurfaceActive = 'true';
    node.style.animation = 'none';
    node.style.opacity = '0';
    pending.set(node, requestAnimationFrame(() => enter(node)));
  }
  function close(state: Surface) {
    const { node, key } = state;
    active.delete(node); dispose(state);
    node.style.transform = state.transform; node.style.opacity = '1'; node.style.transformOrigin = state.originStyle;
    if (reducedMotion() || typeof node.animate !== 'function') return;
    // Preserve scope selectors without retaining any interactive or modal ancestor.
    const ghost = node.cloneNode(true) as HTMLElement, wrapper = doc.createElement('div');
    wrapper.dataset.motionPresentation = ''; wrapper.setAttribute('aria-hidden', 'true'); wrapper.inert = true;
    Object.assign(wrapper.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '50' });
    let parent: HTMLElement = wrapper;
    for (const className of state.ancestors) { const context = doc.createElement('div'); context.className = className; context.style.display = 'contents'; parent.append(context); parent = context; }
    ghost.querySelectorAll('script,iframe,video,audio').forEach(element => element.remove());
    ghost.querySelectorAll<HTMLElement>('a,button,input,textarea,select,[tabindex],[autofocus]').forEach(element => { element.tabIndex = -1; element.removeAttribute('autofocus'); });
    [ghost, ...ghost.querySelectorAll<HTMLElement>('[id]')].forEach(element => element.removeAttribute('id'));
    ghost.removeAttribute('role'); ghost.removeAttribute('aria-modal'); ghost.removeAttribute('data-state'); ghost.removeAttribute('data-slot');
    ghost.style.cssText = state.css;
    Object.assign(ghost.style, { position: 'fixed', left: `${state.rect.left}px`, top: `${state.rect.top}px`, right: 'auto', bottom: 'auto', width: `${state.rect.width}px`, height: `${state.rect.height}px`, boxSizing: 'border-box', margin: '0', translate: 'none', transformOrigin: state.origin, pointerEvents: 'none', animation: 'none', transition: 'none' });
    parent.append(ghost); doc.body.append(wrapper); ghost.scrollTop = node.scrollTop;
    const leaving = { ...state, node: ghost, transform: '', unsubscribe: () => {} };
    exits.get(key)?.stop(); exits.get(key)?.node.remove();
    exits.set(key, leaving);
    const stopMove = state.value.on('change', n => paint(leaving, n)), stopFade = state.alpha.on('change', n => { ghost.style.opacity = String(n); });
    leaving.unsubscribe = () => { stopMove(); stopFade(); }; paint(leaving, state.value.get()); ghost.style.opacity = String(state.alpha.get());
    const movement = animate(state.value, 0, motionDesign.surfaceExit);
    const fade = animate(state.alpha, 0, motionDesign.surfaceExit);
    leaving.stop = () => { movement.stop(); fade.stop(); leaving.unsubscribe(); wrapper.remove(); };
    fade.then(() => { if (exits.get(key) === leaving) { leaving.stop(); exits.delete(key); } });
  }
  function scan(node: Node) {
    if (!(node instanceof HTMLElement) || node.closest('[data-motion-presentation]')) return;
    if (node.matches(selector)) schedule(node);
    node.querySelectorAll<HTMLElement>(selector).forEach(schedule);
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      record.addedNodes.forEach(scan);
      if (record.type === 'attributes') scan(record.target);
    }
    active.forEach(state => { if (!visible(state.node)) close(state); });
  });
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state', 'open', 'data-motion-ready'] });
  doc.addEventListener('pointerdown', sourceEvent, true); doc.addEventListener('keydown', sourceEvent, true);
  window.addEventListener('scroll', refresh, { passive: true, capture: true }); window.addEventListener('resize', refresh);
  function reset() {
    pending.forEach((id, node) => { cancelAnimationFrame(id); node.style.opacity = '1'; }); pending.clear();
    active.forEach(state => { dispose(state); state.node.style.transform = state.transform; state.node.style.transformOrigin = state.originStyle; state.node.style.opacity = '1'; }); active.clear();
    exits.forEach(state => state.stop()); exits.clear();
  }
  const preference = () => { if (reducedMotion()) reset(); };
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  window.addEventListener('mooncci:motion-change', preference); media.addEventListener('change', preference);
  return () => { observer.disconnect(); reset(); doc.removeEventListener('pointerdown', sourceEvent, true); doc.removeEventListener('keydown', sourceEvent, true); window.removeEventListener('scroll', refresh, true); window.removeEventListener('resize', refresh); window.removeEventListener('mooncci:motion-change', preference); media.removeEventListener('change', preference); };
}
