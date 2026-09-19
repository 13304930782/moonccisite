import {useLocation} from 'react-router-dom';
import {api} from '../lib/api';
import {applyPageMeta} from '../lib/pageMeta';
import { brandText } from '../lib/brand';
import { useEffect } from 'react';
import { safeImageSrc } from '../lib/safeUrl';
import { useSiteSettings } from '../context/SiteSettingsContext';

function ensureFavicon() {
  let link = document.querySelector(
    "link[rel~='icon']",
  ) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  return link;
}

export function SiteMeta() {
  const { data } = useSiteSettings();
  const {pathname}=useLocation();
  const name=brandText(data?.brand?.site_title||'mooncci');
  useEffect(()=>{
    const controller=new AbortController();
    const canonical=document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if(!canonical || new URL(canonical.href).pathname!==pathname)applyPageMeta({title:name,description:'记录文章、日常近况与作品进展。',robots:'noindex, follow'});
    api(`/seo?path=${encodeURIComponent(pathname)}`,{signal:controller.signal}).then(meta=>{if(!controller.signal.aborted)applyPageMeta(meta);}).catch(()=>{});
    return()=>controller.abort();
  },[pathname,name]);
  useEffect(() => {
    if (!data) return;
    const brand = data.brand;
    const favicon = safeImageSrc(brand.favicon_url);
    if (favicon) ensureFavicon().href = favicon;
    else
      document
        .querySelectorAll("link[rel~='icon']")
        .forEach((link) => link.remove());
  }, [data]);
  return null;
}
