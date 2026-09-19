import { useMoonTheme } from '../context/ThemeContext';
import { brandText } from '../lib/brand';
import { Link } from 'react-router-dom';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { safeHref, safeImageSrc } from '../lib/safeUrl';
export function SiteFooter() {
  const { theme } = useMoonTheme();
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
            <Link to="/about">关于我</Link><Link to="/links">友情链接</Link>
            <Link to="/archives">文章归档</Link>
            <Link to="/rss">RSS 订阅</Link>
            <a href="https://status.mooncci.site" target="_blank" rel="noopener noreferrer">服务状态</a>
          </nav>
        </div>
        <div className="footer-status">
          <iframe
            title="mooncci 实时服务状态"
            src={`https://status.mooncci.site/badge?theme=${theme}`}
            width="250"
            height="30"
            loading="lazy"
            scrolling="no"
            referrerPolicy="no-referrer"
            style={{ border: 0, maxWidth: '100%', colorScheme: 'normal', display: 'block' }}
          />
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
