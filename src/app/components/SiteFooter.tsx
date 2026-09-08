import { brandText } from '../lib/brand';
import { Link } from 'react-router-dom';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { safeHref, safeImageSrc } from '../lib/safeUrl';
export function SiteFooter() {
  const { data: settings } = useSiteSettings();
  const footer = settings?.footer || {};
  return (
    <footer className="site-footer">
      <div className="site-container">
        <div className="footer-top">
          <Link className="site-brand" to="/">
            mooncci
          </Link>
          <nav className="footer-links" aria-label="页脚导航">
            <Link to="/articles">文章</Link>
            <Link to="/projects">作品</Link>
            <Link to="/updates">最近更新</Link>
            <Link to="/rss">RSS 订阅</Link>
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
