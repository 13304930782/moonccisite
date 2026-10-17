/** Electricity-only reveal gate: never spend a row's entrance while scrolling past it. */
export function observeElectricityReveals(root: HTMLElement, reduceMotion: boolean) {
  const nodes = [...(root.matches('[data-elec-reveal]') ? [root] : []), ...root.querySelectorAll<HTMLElement>('[data-elec-reveal]')];
  if (reduceMotion || typeof IntersectionObserver === 'undefined') {
    nodes.forEach(node => {node.dataset.visible = 'true';});
    return () => {};
  }
  const pending = new Set(nodes.filter(node => node.dataset.visible !== 'true'));
  const visible = new Set<HTMLElement>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const settle = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (disposed) return;
      for (const node of visible) {
        node.dataset.visible = 'true';
        pending.delete(node);
        observer.unobserve(node);
      }
      visible.clear();
    }, 200);
  };
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const node = entry.target as HTMLElement;
      if (!pending.has(node)) continue;
      if (entry.isIntersecting && entry.intersectionRatio >= .5) visible.add(node);
      else visible.delete(node);
    }
    settle();
  }, {threshold: .5});
  pending.forEach(node => {node.dataset.visible = 'false'; observer.observe(node);});
  window.addEventListener('scroll', settle, {passive: true, capture: true});
  return () => {
    disposed = true;
    clearTimeout(timer);
    observer.disconnect();
    window.removeEventListener('scroll', settle, true);
  };
}
