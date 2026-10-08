// Idle CPU alone does not mean the initial network requests have finished.
export function afterInitialLoad(callback: () => void, delay = 1500) {
  let timer: number | undefined, idle: number | undefined, cancelled = false;
  const run = () => { if (!cancelled) callback(); };
  const schedule = () => {
    timer = window.setTimeout(() => {
      if ('requestIdleCallback' in window) idle = window.requestIdleCallback(run, { timeout: 3000 });
      else run();
    }, delay);
  };
  if (document.readyState === 'complete') schedule();
  else window.addEventListener('load', schedule, { once: true });
  return () => { cancelled = true; window.removeEventListener('load', schedule); window.clearTimeout(timer); if (idle !== undefined) window.cancelIdleCallback(idle); };
}
