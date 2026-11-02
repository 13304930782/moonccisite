import {reducedMotion} from '../../lib/motionPreference';
export type ThemeEffects = {className:string;styles:string;faviconSvg?:string;dispose?:() => void};
export function installTheme(theme:ThemeEffects, favicon:boolean) {
  const href = theme.faviconSvg && 'data:image/svg+xml,' + encodeURIComponent(theme.faviconSvg);
  document.documentElement.classList.add(theme.className);
  const sheet = document.createElement('style'); sheet.textContent = theme.styles; document.head.append(sheet);
  const originals = new Map<HTMLLinkElement,string|null>();
  let created:HTMLLinkElement|undefined;
  const apply = () => {
    let links = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')];
    if (!links.length) {created = document.createElement('link');created.rel='icon';document.head.append(created);links=[created];}
    for (const link of links) {
      if (link.getAttribute('href') === href) continue;
      originals.set(link,link.getAttribute('href'));link.setAttribute('href',href!);
    }
  };
  const observer = new MutationObserver(apply);
  if (favicon && href) {observer.observe(document.head,{subtree:true,childList:true,attributes:true,attributeFilter:['href','rel']});apply();}
  return () => {
    observer.disconnect();sheet.remove();document.documentElement.classList.remove(theme.className);
    for (const [link,original] of originals) {
      if (link === created && original === null) link.remove();
      else if (link.isConnected) original === null ? link.removeAttribute('href') : link.setAttribute('href',original);
    }
    theme.dispose?.();
  };
}

export function observeMotion(target:Element|null, change:(moving:boolean) => void) {
  let visible = false;
  const update = () => change(visible && !document.hidden && !reducedMotion());
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const observer = new IntersectionObserver(([entry]) => {visible = entry.isIntersecting;update();});
  if (target) observer.observe(target);
  media.addEventListener('change',update);window.addEventListener('mooncci:motion-change',update);document.addEventListener('visibilitychange',update);
  return () => {observer.disconnect();media.removeEventListener('change',update);window.removeEventListener('mooncci:motion-change',update);document.removeEventListener('visibilitychange',update);};
}
export const environment = {observeMotion};
export type FestivalEnvironment = typeof environment;
