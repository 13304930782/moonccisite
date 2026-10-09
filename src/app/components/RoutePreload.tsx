import { useEffect } from 'react';
import { preloadPage } from '../lib/preloadPage';
export function RoutePreload() {
  useEffect(() => {
    const preload = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>('a[href]');
      if (link && link.origin === location.origin && !link.hasAttribute('download')) preloadPage(link.pathname);
    };
    document.addEventListener('pointerover', preload, {passive:true});
    document.addEventListener('focusin', preload);
    document.addEventListener('touchstart', preload, {passive:true});
    return () => { document.removeEventListener('pointerover', preload); document.removeEventListener('focusin', preload); document.removeEventListener('touchstart', preload); };
  }, []);
  return null;
}
