import { useI18n } from '../i18n';
import { useMoonTheme } from '../context/ThemeContext';
import { brandText } from '../lib/brand';

import {Link} from './LocaleLink';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { safeHref, safeImageSrc } from '../lib/safeUrl';
export function SiteFooter() {
  const { t } = useI18n();
  const { theme } = useMoonTheme();
  const { data: settings } = useSiteSettings();
  const footer = settings?.footer || {};
  const status = <div className="footer-status">
    <iframe
      title={t("m_8bdc2dbf19")}
      src={`https://status.mooncci.site/badge?theme=${theme}`}
      width="250"
      height="30"
      loading="lazy"
      scrolling="no"
      referrerPolicy="no-referrer"
    />
  </div>;
  return (
    <footer className="site-footer">
      <div className="site-container">
        {status}
        <div className="footer-top">
          <Link className="site-brand" to="/">
            mooncci
          </Link>
          <nav className="footer-links" aria-label={t("m_a512b3fc5b")}>
            <Link to="/about">{t("m_89ae6c0fdf")}</Link>
            <Link to="/links">{t("m_c2a2f8293d")}</Link>
            <Link to="/archives">{t("m_aa226b33b3")}</Link>
            <Link to="/rss">{t("m_26ef7656f4")}</Link>
            <Link to="/mail-setup">{t("m_ce3687817c")}</Link>
            <Link to="/node-monitor">{t("m_07e96c1e12")}</Link>
            <a href="https://status.mooncci.site" target="_blank" rel="noopener noreferrer">{t("m_e8a4f7c09d")}</a>
          </nav>
        </div>
        <div className="footer-legal">
          <span>{brandText(footer.copyright)}</span>
          <div className="footer-compliance">
            {footer.icp_text && (
              <a
                href={safeHref(footer.icp_url)}
                target="_blank"
                rel="noreferrer"
              >
                {footer.icp_text}
              </a>
            )}
            {footer.police_text && (
              <a
                href={safeHref(footer.police_url)}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={safeImageSrc(footer.police_icon_url) || '/beian.png'}
                  alt=""
                  width="16"
                  height="16"
                  onError={(event) => {
                    if (
                      event.currentTarget.getAttribute('src') !== '/beian.png'
                    ) {
                      event.currentTarget.src = '/beian.png';
                    }
                  }}
                />
                {footer.police_text}
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
