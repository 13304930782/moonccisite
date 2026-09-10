import { FormEvent, useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Search, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ThemeToggle } from '../context/ThemeContext';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { safeImageSrc } from '../lib/safeUrl';
import { preloadPage } from '../lib/preloadPage';
export function Header() {
  const { user, logout, loggingOut, logoutError } = useAuth();
  const { data: settings } = useSiteSettings();
  const brand = settings?.brand || {};
  const [menu, setMenu] = useState(false),
    [search, setSearch] = useState(false),
    [keyword, setKeyword] = useState('');
  const navigate = useNavigate(),
    location = useLocation();
  useEffect(() => {
    setMenu(false);
    setSearch(false);
  }, [location.pathname, location.search]);
  useEffect(() => {
    function close(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenu(false);
        setSearch(false);
      }
    }
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  const admin =
    user && ['owner', 'admin', 'editor'].includes(user.role)
      ? '/admin'
      : '/admin/editor-apply';
  const links = [
    ['/articles', '文章'],
    ['/updates', '近况'],
    ['/projects', '作品'],
    ['/electricity', '宿舍电量监控'],
    ['/early-access', 'Early Access'],
  ];
  function submit(e: FormEvent) {
    e.preventDefault();
    if (keyword.trim())
      navigate('/search?q=' + encodeURIComponent(keyword.trim()));
  }
  return (
    <header className="site-header">
      <div className="site-container header-inner">
        <Link className="site-brand" to="/">
          {safeImageSrc(brand.logo_url) && (
            <img src={safeImageSrc(brand.logo_url)} alt="" />
          )}
          <span>mooncci</span>
        </Link>
        <nav className="desktop-nav" aria-label="主导航">
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} onPointerEnter={() => preloadPage(to)} onFocus={() => preloadPage(to)} onTouchStart={() => preloadPage(to)}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          <button
            className="icon-button"
            onClick={() => setSearch(!search)}
            aria-label="搜索文章"
            aria-expanded={search}
          >
            <Search />
          </button>
          <ThemeToggle />
          <div className="header-account">
            {user ? (
              <details className="nav-disclosure">
                <summary>{user.username}</summary>
                <div className="nav-popover">
                  <Link to={admin}>
                    {user.role === 'user' ? '申请成为编辑' : '控制台'}
                  </Link>
                  <Link to="/account/settings">个人设置</Link>
              <button onClick={() => void logout()} disabled={loggingOut}>
                    {loggingOut ? '正在退出…' : '退出登录'}
                  </button>
                </div>
              </details>
            ) : (
              <Link to="/login">登录 / 注册</Link>
            )}
          </div>
          <button
            className="icon-button mobile-menu-button"
            aria-expanded={menu}
            aria-controls="mobile-navigation"
            aria-label={menu ? '关闭菜单' : '打开菜单'}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      {search && (
        <form className="site-container header-search" onSubmit={submit}>
          <label className="sr-only" htmlFor="header-query">
            搜索文章
          </label>
          <input
            id="header-query"
            autoFocus
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索文章…"
          />
          <button className="quiet-button">搜索</button>
        </form>
      )}
      {menu && (
        <nav
          id="mobile-navigation"
          className="mobile-navigation"
          aria-label="手机导航"
        >
          {links.map(([to, label]) => (
            <Link key={to} to={to}>
              {label}
            </Link>
          ))}
          {user ? (
            <>
              <Link to={admin}>
                {user.role === 'user' ? '申请成为编辑' : '控制台'}
              </Link>
              <Link to="/account/settings">个人设置</Link>
              <button onClick={() => void logout()} disabled={loggingOut}>
                {loggingOut ? '正在退出…' : '退出登录'}
              </button>
            </>
          ) : (
            <>
              <Link to="/login">登录账户</Link>
              <Link to="/register">注册账号</Link>
            </>
          )}
        </nav>
      )}
      {logoutError && (
        <p
          className="site-container py-2 text-sm text-destructive"
          role="alert"
        >
          {logoutError}
        </p>
      )}
    </header>
  );
}
