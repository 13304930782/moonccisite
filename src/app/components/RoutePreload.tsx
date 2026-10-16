import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { preloadPage } from '../lib/preloadPage';
export function RoutePreload() {
  const navigate = useNavigate();
  useEffect(() => {
    const preload = (event: Event) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>('a[href]');
      if (link && link.origin === location.origin && !link.hasAttribute('download')) preloadPage(link.pathname);
    };
    const followHash = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self') || link.closest('.detail-preview,.article-full-preview') || /^\/(?:admin|account)(?:\/|$)/.test(location.pathname)) return;
      if (link.origin !== location.origin || link.pathname !== location.pathname || link.search !== location.search || !link.href.includes('#')) return;
      // Router-owned entries keep hash navigation compatible with back/scroll/blockers.
      event.preventDefault();
      navigate(link.pathname + link.search + link.hash, { replace: link.hash === location.hash });
    };
    document.addEventListener('pointerover', preload, {passive:true});
    document.addEventListener('focusin', preload);
    document.addEventListener('touchstart', preload, {passive:true});
    document.addEventListener('click', followHash);
    return () => { document.removeEventListener('pointerover', preload); document.removeEventListener('focusin', preload); document.removeEventListener('touchstart', preload); document.removeEventListener('click', followHash); };
  }, [navigate]);
  return null;
}
