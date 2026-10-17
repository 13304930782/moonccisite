import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { rememberSiteVisit, type SiteVisit } from '../lib/siteHistory';
import { pageScrollElement, pageScrollTop, paginationSelector, scrollPageTo } from '../lib/pageScroll';
const positions = new Map<string, number>();
const PreviousSiteVisit = createContext<SiteVisit | null>(null);
const RestoredPagePosition = createContext(false);
export const usePreviousSiteVisit = () => useContext(PreviousSiteVisit);
export const useRestoredPagePosition = () => useContext(RestoredPagePosition);
export function RoutePosition({ children }: { children?: ReactNode }) {
  const location = useLocation(), navigation = useNavigationType();
  // Capture before recording this visit, including when its lazy page mounts later.
  const restored = useMemo(() => navigation === 'POP' && positions.has(location.key), [location.key,navigation]);
  const visits = useRef(new Map<number, SiteVisit>());
  const [previousVisit, setPreviousVisit] = useState<SiteVisit | null>(null);
  const previousLocation = useRef<typeof location | null>(null);
  useLayoutEffect(() => {
    setPreviousVisit(rememberSiteVisit(visits.current, history.state?.idx, location, navigation));
  }, [location.key, location.pathname, location.search, location.hash, navigation]);
  useLayoutEffect(() => {
    if (location.key !== 'default') delete document.documentElement.dataset.documentHydrating;
    const previous = history.scrollRestoration; history.scrollRestoration = 'manual';
    const last = previousLocation.current; previousLocation.current = location;
    const scrollTop = () => pageScrollTop(location.pathname);
    const scrollTo = (top: number) => scrollPageTo(top,location.pathname);
    const samePage = last?.pathname === location.pathname;
    const retain = samePage && (navigation === 'REPLACE' || location.state?.preserveScroll === location.pathname);
    const hint=location.state?.pagination;
    const pagination=navigation!=='POP'&&hint?.pathname===location.pathname&&Number.isInteger(hint.index)&&hint.index>=0&&Number.isFinite(hint.top)?hint:null;
    const target = navigation === 'POP' ? positions.get(location.key) || 0 : pagination || retain ? scrollTop() : 0;
    let restoring = navigation === 'POP' && target > 0 || Boolean(pagination);
    let timer: ReturnType<typeof setTimeout>;
    let anchorObserver: MutationObserver | undefined;
    let layer: Element | null = null;
    const record = () => { if (positions.size > 100) positions.delete(positions.keys().next().value!); positions.set(location.key, scrollTop()); };
    const restore = () => {
      if(!restoring)return;
      const nav=pagination&&document.querySelectorAll<HTMLElement>(paginationSelector)[pagination.index];
      scrollTo(nav?scrollTop()+nav.getBoundingClientRect().top-pagination.top:target);
      if(pagination&&nav)record();
    };
    const save = () => { if (!restoring) record(); };
    const stop = () => { restoring = false; observer.disconnect(); contentObserver.disconnect(); anchorObserver?.disconnect(); record(); };
    const observer = new ResizeObserver(restore);
    const observeContent = () => {
      const next = pageScrollElement(location.pathname)?.querySelector('.admin-content') || document.querySelector('.moon-app-layer') || document.body;
      if (layer === next) return;
      observer.disconnect(); layer = next; observer.observe(next); restore();
    };
    const contentObserver = new MutationObserver(observeContent);
    // Observe content growth, including a lazy admin shell's inner scroll container.
    if (restoring) { observeContent(); contentObserver.observe(document.body,{childList:true,subtree:true}); timer = setTimeout(stop, 5000); }
    else if (location.hash && !retain && (!samePage || last?.hash !== location.hash && last?.search === location.search)) {
      let anchor = '';
      try { anchor = decodeURIComponent(location.hash.slice(1)); } catch { /* Invalid fragments must not break navigation. */ }
      const reveal = () => {
        const element = anchor && document.getElementById(anchor);
        if (!element) return false;
        element.scrollIntoView({ block:'start', behavior:'instant' });
        anchorObserver?.disconnect();
        return true;
      };
      if (anchor && !reveal()) {
        anchorObserver = new MutationObserver(reveal);
        anchorObserver.observe(document.body, { childList:true, subtree:true });
        timer = setTimeout(() => anchorObserver?.disconnect(), 5000);
      }
    } else if (!retain) scrollTo(0);
    if(!restoring)record();
    window.addEventListener('scroll', save, { passive: true, capture: true });
    window.addEventListener('wheel', stop, { passive: true }); window.addEventListener('touchstart', stop, { passive: true }); window.addEventListener('keydown', stop);
    if(pagination)window.addEventListener('pointerdown',stop,{passive:true});
    // Scroll events saved this page before the next page's DOM could clamp scrollY.
    return () => { clearTimeout(timer); observer.disconnect(); contentObserver.disconnect(); anchorObserver?.disconnect(); window.removeEventListener('scroll', save, true); window.removeEventListener('wheel', stop); window.removeEventListener('touchstart', stop); window.removeEventListener('keydown', stop); window.removeEventListener('pointerdown',stop); history.scrollRestoration = previous; };
  }, [location.key, navigation, location.hash]);
  return <PreviousSiteVisit.Provider value={previousVisit}><RestoredPagePosition.Provider value={restored}>{children}</RestoredPagePosition.Provider></PreviousSiteVisit.Provider>;
}
