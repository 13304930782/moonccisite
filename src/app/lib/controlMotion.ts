import { animate, motionValue } from 'motion';
import { motionDesign } from './motionDesign';
import { reducedMotion } from './motionPreference';

const controls = '.ui-press-feedback,.ui-btn,.neo-button,.quiet-button,.icon-button,.article-button,.account-primary-button,.workflow-button,.engagement-button,.theme-select-trigger,.mailbox-primary,.mailbox-secondary,.mailbox-back,.mailbox-text-button,.mailbox-view-tabs button,[data-slot=switch],[data-slot=toggle]';

export function installControlMotion(doc = document) {
  doc.documentElement.dataset.motionControls = 'true';
  const entries = new Map<HTMLElement, { value: ReturnType<typeof motionValue<number>>; stop: () => void; unsubscribe: () => void; scale: string; version: number }>();
  let held: HTMLElement | null = null;
  function move(node: HTMLElement, pressed: boolean) {
    if (reducedMotion() || typeof node.animate !== 'function') return;
    let entry = entries.get(node);
    if (!entry) {
      const value = motionValue(Number.parseFloat(getComputedStyle(node).scale) || 1), scale = node.style.scale;
      entry = { value, scale, version: 0, stop: () => {}, unsubscribe: value.on('change', n => { node.style.scale = String(n); }) };
      entries.set(node, entry);
      node.style.scale = String(value.get());
    }
    entry.stop(); const version = ++entry.version;
    node.dataset.motionPressed = String(pressed);
    const animation = animate(entry.value, pressed ? .96 : 1, pressed ? motionDesign.press : motionDesign.releaseSpring);
    entry.stop = () => animation.stop();
    const current = entry;
    animation.then(() => {
      if (entries.get(node) !== current || current.version !== version || pressed || held === node) return;
      current.unsubscribe(); node.style.scale = current.scale; delete node.dataset.motionPressed; entries.delete(node);
    });
  }
  const release = () => { const node = held; held = null; if (node) move(node, false); };
  const find = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>(controls) : null;
  function down(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0) return;
    const node = find(event.target);
    if (!node || node.matches(':disabled,[aria-disabled=true]')) return;
    release(); held = node; move(node, true);
  }
  function keydown(event: KeyboardEvent) {
    if (event.repeat || !['Enter', ' '].includes(event.key)) return;
    const node = find(event.target);
    if (!node || !node.matches('button,[role=button]') || node.matches(':disabled,[aria-disabled=true]')) return;
    held = node; move(node, true);
  }
  function reset() {
    held = null;
    entries.forEach((entry, node) => { entry.stop(); entry.unsubscribe(); node.style.scale = entry.scale; delete node.dataset.motionPressed; });
    entries.clear();
  }
  const preference = () => { if (reducedMotion()) reset(); };
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  doc.addEventListener('pointerdown', down, true);
  doc.addEventListener('pointerup', release, true); doc.addEventListener('pointercancel', release, true);
  doc.addEventListener('keydown', keydown, true); doc.addEventListener('keyup', release, true);
  window.addEventListener('blur', release); window.addEventListener('mooncci:motion-change', preference); media.addEventListener('change', preference);
  return () => {
    delete doc.documentElement.dataset.motionControls;
    reset(); doc.removeEventListener('pointerdown', down, true); doc.removeEventListener('pointerup', release, true); doc.removeEventListener('pointercancel', release, true);
    doc.removeEventListener('keydown', keydown, true); doc.removeEventListener('keyup', release, true);
    window.removeEventListener('blur', release); window.removeEventListener('mooncci:motion-change', preference); media.removeEventListener('change', preference);
  };
}
