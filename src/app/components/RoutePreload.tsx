import { afterInitialLoad } from '../lib/afterInitialLoad';
import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { preloadPage } from '../lib/preloadPage';
export function RoutePreload() {
  const {user, loading} = useAuth();
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
  useEffect(() => {
    if (user || loading) return;
    const connection = (navigator as Navigator & {connection?:{saveData?:boolean; effectiveType?:string}}).connection;
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')) return;
    let cancel: (() => void) | undefined, done = false;
    const schedule = () => {
      if (done || document.querySelector('main [aria-busy="true"]')) return; done = true;
      cancel = afterInitialLoad(() => preloadPage('/login'), 3000);
    };
    window.addEventListener('mooncci:content-ready', schedule);
    if (document.querySelector('main .resource-content[aria-busy="false"]')) schedule();
    return () => { window.removeEventListener('mooncci:content-ready', schedule); cancel?.(); };
  }, [user, loading]);
  return null;
}
