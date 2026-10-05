// System accessibility always wins; the local preference can only reduce motion.
export function reducedMotion() {
  return document.documentElement.dataset.reducedMotion === 'true' || matchMedia('(prefers-reduced-motion: reduce)').matches;
}
export function syncMotionPreference() {
  let local = false;
  try { local = JSON.parse(localStorage.getItem('mooncci-reading') || '{}').reduceMotion === true; } catch { /* Optional preference. */ }
  document.documentElement.dataset.reducedMotion = String(local || matchMedia('(prefers-reduced-motion: reduce)').matches);
  window.dispatchEvent(new Event('mooncci:motion-change'));
}
export function installMotionPreference() {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  syncMotionPreference();
  media.addEventListener('change', syncMotionPreference);
  const storage = (event: StorageEvent) => { if (event.key === 'mooncci-reading') syncMotionPreference(); };
  window.addEventListener('storage', storage);
  return () => { media.removeEventListener('change', syncMotionPreference); window.removeEventListener('storage', storage); };
}
