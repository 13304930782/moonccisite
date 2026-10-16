import { animate } from 'motion/mini';
import { reducedMotion } from './motionPreference';

// Animation owns only presentation; callers commit the new state before starting it.
export function feedbackMotion(element: HTMLElement, keyframes: Parameters<typeof animate>[1], duration = .18) {
  if (reducedMotion() || typeof element.animate !== 'function') return () => {};
  let animation: ReturnType<typeof animate>;
  try { animation = animate(element, keyframes, { duration, ease: [.2, .8, .2, 1] }); } catch { return () => {}; }
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    animation.cancel();
    media.removeEventListener('change', changed);
    window.removeEventListener('mooncci:motion-change', changed);
  };
  const changed = () => { if (reducedMotion()) stop(); };
  media.addEventListener('change', changed);
  window.addEventListener('mooncci:motion-change', changed);
  animation.then(stop, stop);
  return stop;
}
