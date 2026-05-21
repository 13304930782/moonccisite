import { useEffect } from 'react';
import { api } from '../lib/api';
import { initialSiteSettings } from '../config/initialSiteSettings';

const defaultBrand = {
  site_title: '个人博客网站设计',
  favicon_url: '',
};

function ensureFavicon() {
  let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;

  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }

  return link;
}

export function SiteMeta() {
  useEffect(() => {
    api('/settings/site')
      .then((data) => {
        const brand = {
          ...defaultBrand,
          ...(initialSiteSettings.brand || {}),
          ...(data.brand || {}),
        };

        if (brand.site_title) {
          document.title = brand.site_title;
        }

        if (brand.favicon_url) {
          const link = ensureFavicon();
          link.href = brand.favicon_url;
        }
      })
      .catch(() => {});
  }, []);

  return null;
}
