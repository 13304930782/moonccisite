import { useEffect, useState } from 'react';
import { ArrowUpRight, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
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
    api('/settings/site').then((data) => setFooter({ ...defaultFooter, ...(data.footer || {}) })).catch(() => {});
  }, []);

  return (
    <footer className="border-t-2 border-black bg-[#171e19] px-5 py-12 text-white lg:px-6">
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_0.7fr_0.7fr_1fr]">
        <div>
          <Link to="/" className="inline-flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center border-2 border-white bg-[#ffe17c] text-black">
              <Zap className="h-5 w-5 fill-black" />
            </span>
            <span className="neo-heading text-2xl tracking-[-0.04em]">MOONCCI</span>
          </Link>
          <p className="mt-5 max-w-sm text-sm font-bold leading-7 text-white/60">
            一个持续生长的独立技术知识库。写代码，也写清楚代码背后的选择。
          </p>
        </div>

        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#b7c6c2]">Explore</h3>
          <div className="mt-5 space-y-3 text-sm font-bold">
            <Link to="/articles" className="block hover:text-[#ffe17c]">全部文章</Link>
            <Link to="/categories" className="block hover:text-[#ffe17c]">内容分类</Link>
            <Link to="/tags" className="block hover:text-[#ffe17c]">标签索引</Link>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#b7c6c2]">Account</h3>
          <div className="mt-5 space-y-3 text-sm font-bold">
            <Link to="/login" className="block hover:text-[#ffe17c]">登录</Link>
            <Link to="/register" className="block hover:text-[#ffe17c]">注册</Link>
            <Link to="/admin" className="block hover:text-[#ffe17c]">控制台</Link>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.2em] text-[#b7c6c2]">Stay curious</h3>
          <Link to="/articles" className="mt-5 flex items-center justify-between border-2 border-white bg-[#ffe17c] px-4 py-3 font-black text-black shadow-[4px_4px_0_#fff] transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none">
            继续阅读 <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <div className="mx-auto mt-12 flex max-w-7xl flex-col gap-4 border-t-2 border-white/20 pt-6 text-xs font-bold text-white/50 md:flex-row md:items-center md:justify-between">
        <p>{footer.copyright}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-5">
          {footer.icp_text && <a href={icpUrl} target="_blank" rel="noreferrer" className="hover:text-[#ffe17c]">{footer.icp_text}</a>}
          {footer.police_text && (
            <a href={policeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-[#ffe17c]">
              {policeIconUrl && <img src={policeIconUrl} alt="" className="h-4 w-4 object-contain" />}
              {footer.police_text}
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
