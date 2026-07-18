import { Search, Zap } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CardNav, CardNavItem } from './CardNav';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { initialSiteSettings } from '../config/initialSiteSettings';
import { safeImageSrc } from '../lib/safeUrl';

const defaultBrand = {
  site_title: 'Mooncci Blog',
  nav_title: 'MOONCCI',
  logo_url: '',
  favicon_url: '',
};

export function Header() {
  const [keyword, setKeyword] = useState('');
  const [brand, setBrand] = useState({ ...defaultBrand, ...(initialSiteSettings.brand || {}) });
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const logoUrl = safeImageSrc(brand.logo_url);
  const adminEntryPath = user && ['owner', 'admin', 'editor'].includes(user.role)
    ? '/admin'
    : '/admin/editor-apply';

  useEffect(() => {
    api('/settings/site')
      .then((data) => setBrand({ ...defaultBrand, ...(data.brand || {}) }))
      .catch(() => {});
  }, []);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = keyword.trim();
    if (!value) return;
    navigate(`/search?q=${encodeURIComponent(value)}`);
    setKeyword('');
  };

  const items: CardNavItem[] = [
    {
      eyebrow: '01 / READ',
      label: '阅读',
      bgColor: '#b7c6c2',
      textColor: '#000000',
      links: [
        { label: '返回首页', ariaLabel: '前往网站首页', to: '/' },
        { label: '全部文章', ariaLabel: '浏览全部文章', to: '/articles' },
      ],
      extra: (
        <form className="card-nav-search" onSubmit={submitSearch}>
          <Search aria-hidden="true" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索文章"
            aria-label="搜索文章"
          />
          <button type="submit">搜索</button>
        </form>
      ),
    },
    {
      eyebrow: '02 / EXPLORE',
      label: '探索',
      bgColor: '#ffe17c',
      textColor: '#000000',
      links: [
        { label: '内容分类', ariaLabel: '按分类浏览文章', to: '/categories' },
        { label: '热门标签', ariaLabel: '按标签浏览文章', to: '/tags' },
      ],
    },
    {
      eyebrow: user ? `@${user.username}` : '03 / ACCOUNT',
      label: user ? '我的账户' : '加入社区',
      bgColor: '#171e19',
      textColor: '#ffffff',
      links: user
        ? [
            { label: '控制台', ariaLabel: '进入内容控制台', to: adminEntryPath },
            { label: '退出登录', ariaLabel: '退出当前账户', onClick: logout },
          ]
        : [
            { label: '登录账户', ariaLabel: '登录 Mooncci Blog', to: '/login' },
            { label: '注册账号', ariaLabel: '注册 Mooncci Blog 账号', to: '/register' },
            { label: '申请成为编辑', ariaLabel: '申请成为网站编辑', to: '/admin/editor-apply' },
          ],
    },
  ];

  return (
    <CardNav
      brand={brand.nav_title || 'MOONCCI'}
      logo={logoUrl}
      logoFallback={<Zap className="h-5 w-5 fill-current" />}
      items={items}
      cta={
        user ? (
          <Link to={adminEntryPath} className="neo-button neo-button-dark">控制台</Link>
        ) : (
          <>
            <Link to="/login" className="neo-button card-nav-login-button">登录</Link>
            <Link to="/register" className="neo-button neo-button-dark">加入社区</Link>
          </>
        )
      }
    />
  );
}
