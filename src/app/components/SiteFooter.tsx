import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { initialSiteSettings } from '../config/initialSiteSettings';
import { safeHref, safeImageSrc } from '../lib/safeUrl';

const defaultFooter = {
  copyright: 'Copyright mooncci in LNTU',
  icp_text: '辽ICP备2024042989号-1',
  icp_url: 'https://beian.miit.gov.cn/',
  police_text: '辽公网安备21041102000430号',
  police_url: 'https://beian.mps.gov.cn/#/query/webSearch?code=21041102000430',
  police_icon_url: 'https://moooncci.cn/wp-content/uploads/2025/10/police.icon_-1.png',
};

export function SiteFooter() {
  const [footer, setFooter] = useState({ ...defaultFooter, ...(initialSiteSettings.footer || {}) });
  const icpUrl = safeHref(footer.icp_url || defaultFooter.icp_url, defaultFooter.icp_url);
  const policeUrl = safeHref(footer.police_url || defaultFooter.police_url, defaultFooter.police_url);
  const policeIconUrl = safeImageSrc(footer.police_icon_url);

  useEffect(() => {
    api('/settings/site')
      .then((data) => setFooter({ ...defaultFooter, ...(data.footer || {}) }))
      .catch(() => {});
  }, []);

  return (
    <footer className="mt-16 border-t border-gray-200/70 dark:border-gray-800/70 bg-white/40 dark:bg-gray-950/40 backdrop-blur px-6 py-8 text-center">
      {footer.copyright && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {footer.copyright}
        </p>
      )}

      <p className="mt-4 flex flex-col items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400 md:flex-row md:gap-6">
        {footer.icp_text && (
          <a
            href={icpUrl}
            target="_blank"
            rel="noreferrer"
            className="hover:text-blue-600 transition-colors"
          >
            {footer.icp_text}
          </a>
        )}

        {footer.police_text && (
          <a
            href={policeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 hover:text-blue-600 transition-colors"
          >
            {policeIconUrl && (
              <img
                src={policeIconUrl}
                alt="公安图标"
                className="h-4 w-4 object-contain"
              />
            )}
            <span>{footer.police_text}</span>
          </a>
        )}
      </p>
    </footer>
  );
}
