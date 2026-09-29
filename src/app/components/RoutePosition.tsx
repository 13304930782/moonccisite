import { useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
const positions = new Map<string, number>();
export function RoutePosition() {
  const location = useLocation(), navigation = useNavigationType();
  useLayoutEffect(() => {
    const previous = history.scrollRestoration; history.scrollRestoration = 'manual';
    const target = navigation === 'POP' ? positions.get(location.key) || 0 : 0;
    let restoring = navigation === 'POP' && target > 0;
    let timer: ReturnType<typeof setTimeout>;
    const restore = () => { if (restoring) window.scrollTo({ top: target, behavior: 'instant' }); };
    const save = () => { if (!restoring) { if (positions.size > 100) positions.delete(positions.keys().next().value!); positions.set(location.key, window.scrollY); } };
    const stop = () => { restoring = false; observer.disconnect(); };
    const observer = new ResizeObserver(restore);
    if (restoring) { restore(); observer.observe(document.body); timer = setTimeout(stop, 5000); }
    else if (!location.hash) window.scrollTo({ top: 0, behavior: 'instant' });
    window.addEventListener('scroll', save, { passive: true });
    window.addEventListener('wheel', stop, { passive: true }); window.addEventListener('touchstart', stop, { passive: true }); window.addEventListener('keydown', stop);
    return () => { if (!restoring) save(); clearTimeout(timer); observer.disconnect(); window.removeEventListener('scroll', save); window.removeEventListener('wheel', stop); window.removeEventListener('touchstart', stop); window.removeEventListener('keydown', stop); history.scrollRestoration = previous; };
  }, [location.key, navigation, location.hash]);
  return null;
}
