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
  useEffect(() => {
    if (!data) return;
    const brand = data.brand;
    document.title = brandText(brand.site_title || 'mooncci');
    const favicon = safeImageSrc(brand.favicon_url);
    if (favicon) ensureFavicon().href = favicon;
    else
      document
        .querySelectorAll("link[rel~='icon']")
        .forEach((link) => link.remove());
  }, [data]);
  return null;
}
