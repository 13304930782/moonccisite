import { Menu, Search, Sun, Moon } from 'lucide-react';
import { motion } from 'motion/react';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { initialSiteSettings } from '../config/initialSiteSettings';
import { safeImageSrc } from '../lib/safeUrl';

const defaultBrand = {
  site_title: '个人博客网站设计',
  nav_title: '计算机博客',
  logo_url: '',
  favicon_url: '',
};

export function Header() {
  const [isDark, setIsDark] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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
      .then((data) => {
        setBrand({ ...defaultBrand, ...(data.brand || {}) });
      })
      .catch(() => {});
  }, []);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();

    const value = keyword.trim();

    if (!value) return;

    navigate(`/search?q=${encodeURIComponent(value)}`);
    setKeyword('');
    setIsMenuOpen(false);
  };

  const navLinks = [
    { label: '首页', to: '/' },
    { label: '文章', to: '/articles' },
    { label: '分类', to: '/categories' },
    { label: '标签', to: '/tags' },
  ];

  return (
    <motion.header
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 left-0 right-0 z-50"
    >
      <div className="mx-4 mt-4 rounded-2xl bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl border border-gray-200/20 dark:border-gray-700/20 shadow-lg shadow-black/5">
        <nav className="px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <Link to="/" className="flex items-center gap-3 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={brand.nav_title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-white font-semibold text-sm">
                    {(brand.nav_title || 'CS').slice(0, 2)}
                  </span>
                )}
              </div>

              <span className="text-lg font-medium text-gray-900 dark:text-white tracking-tight">
                {brand.nav_title || '计算机博客'}
              </span>
            </Link>

            <div className="hidden lg:flex items-center gap-7">
              {navLinks.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="hidden md:block flex-1 max-w-sm">
              <form onSubmit={submitSearch} className="flex items-center gap-2 rounded-full bg-gray-100 dark:bg-gray-800 px-4 py-2">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜索文章..."
                  className="w-full bg-transparent outline-none text-sm text-gray-900 dark:text-white"
                />
              </form>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              {user ? (
                <div className="hidden sm:flex items-center gap-2">
                  <Link to={adminEntryPath} className="rounded-full bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
                    后台
                  </Link>
                  <button onClick={logout} className="rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200">
                    退出
                  </button>
                </div>
              ) : (
                <div className="hidden sm:flex items-center gap-2">
                  <Link to="/login" className="rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200">
                    登录
                  </Link>
                  <Link to="/register" className="rounded-full bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
                    注册
                  </Link>
                </div>
              )}

              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="lg:hidden p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
              >
                <Menu className="w-4 h-4" />
              </button>
            </div>
          </div>

          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="lg:hidden mt-4 pt-4 border-t border-gray-200/50 dark:border-gray-700/50"
            >
              <form onSubmit={submitSearch} className="mb-3 flex items-center gap-2 rounded-full bg-gray-100 dark:bg-gray-800 px-4 py-2">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜索文章..."
                  className="w-full bg-transparent outline-none text-sm text-gray-900 dark:text-white"
                />
              </form>

              {navLinks.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMenuOpen(false)}
                  className="block py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  {item.label}
                </Link>
              ))}

              <div className="mt-3 flex gap-2">
                {user ? (
                  <>
                    <Link to={adminEntryPath} className="rounded-full bg-blue-600 px-4 py-2 text-sm text-white">
                      后台
                    </Link>
                    <button onClick={logout} className="rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-700">
                      退出
                    </button>
                  </>
                ) : (
                  <>
                    <Link to="/login" className="rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-700">
                      登录
                    </Link>
                    <Link to="/register" className="rounded-full bg-blue-600 px-4 py-2 text-sm text-white">
                      注册
                    </Link>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </nav>
      </div>
    </motion.header>
  );
}
