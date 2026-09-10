import { useSiteSettings } from '../../context/SiteSettingsContext';
import { safeImageSrc } from '../../lib/safeUrl';
import { ThemeToggle } from '../../context/ThemeContext';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  ArrowUp,
  Ban,
  Crown,
  FileText,
  Gauge,
  Home,
  Image,
  Inbox,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  PenLine,
  Send,
  Settings,
  ShieldCheck,
  UserRoundCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

type AdminShellProps = {
  children: ReactNode;
};

type MenuItem = {
  title: string;
  to: string;
  icon: typeof LayoutDashboard;
  show: boolean;
};

function getRoleName(role?: string) {
  if (role === 'owner') return '站长';
  if (role === 'admin') return '管理员';
  if (role === 'editor') return '编辑';
  return '普通用户';
}

function getRoleBadgeClass(role?: string) {
  if (role === 'owner') {
    return 'border border-border bg-muted text-foreground shadow-none';
  }

  if (role === 'admin') {
    return 'border border-border bg-muted text-foreground shadow-none';
  }

  if (role === 'editor') {
    return 'border border-border bg-card text-foreground shadow-none';
  }

  return 'border border-border bg-muted text-foreground';
}

function isManager(role?: string) {
  return role === 'owner' || role === 'admin';
}

function canWrite(role?: string) {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

export function AdminShell({ children }: AdminShellProps) {
  const mainRef = useRef<HTMLElement>(null);
  const [showTop, setShowTop] = useState(false);
  function backToTop() {
    const main = mainRef.current;
    if (!main) return;
    const heading = main.querySelector<HTMLElement>('h1') || main;
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
    main.scrollTo({
      top: 0,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }

  const { user, logout, loggingOut, logoutError } = useAuth();
  const { data: settings } = useSiteSettings();
  const brand = settings?.brand || {};
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setMobileOpen(false);
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    setShowTop(false);
  }, [location.pathname]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  const role = user?.role || 'user';
  const manager = isManager(role);
  const writer = canWrite(role);
  const owner = role === 'owner';

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyHeight = body.style.height;
    const previousBodyOverscroll = body.style.overscrollBehavior;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.height = '100%';
    body.style.overscrollBehavior = 'none';

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      body.style.height = previousBodyHeight;
      body.style.overscrollBehavior = previousBodyOverscroll;
    };
  }, []);

  const menus: MenuItem[] = [
    {
      title: '近况与动态',
      to: '/admin/updates',
      icon: MessageCircle,
      show: manager,
    },
    { title: '作品管理', to: '/admin/projects', icon: FileText, show: manager },
    { title: '订阅与周报', to: '/admin/newsletter', icon: Mail, show: owner },
    {
      title: '概览',
      to: '/admin',
      icon: LayoutDashboard,
      show: true,
    },
    {
      title: '文章管理',
      to: '/admin/posts',
      icon: FileText,
      show: writer,
    },
    {
      title: '写文章',
      to: '/admin/write',
      icon: PenLine,
      show: writer,
    },
    {
      title: '媒体库',
      to: '/admin/media',
      icon: Image,
      show: manager,
    },
    {
      title: '编辑申请审核',
      to: '/admin/editor-applications',
      icon: UserRoundCheck,
      show: manager,
    },
    {
      title: 'Early Access 审核',
      to: '/admin/early-access',
      icon: Inbox,
      show: owner,
    },
    {
      title: '水电监控设置',
      to: '/admin/electricity',
      icon: Gauge,
      show: owner,
    },
    {
      title: '评论管理',
      to: '/admin/comments',
      icon: MessageCircle,
      show: manager,
    },
    {
      title: '用户管理',
      to: '/admin/users',
      icon: Users,
      show: manager,
    },
    {
      title: '违禁词设置',
      to: '/admin/banned-words',
      icon: Ban,
      show: manager,
    },
    {
      title: '站点设置',
      to: '/admin/site-settings',
      icon: Settings,
      show: manager,
    },
    {
      title: '第三方登录',
      desc: '管理 GitHub、Google、QQ、微信和 Gitee 登录',
      to: '/admin/login-settings',
      icon: Settings,
      show: user?.role === 'owner',
    },
    {
      title: '邮件设置',
      to: '/admin/mail-settings',
      icon: Mail,
      show: manager,
    },
    {
      title: '发送邮件',
      to: '/admin/send-mail',
      icon: Send,
      show: manager,
    },
    {
      title: '编辑申请',
      to: '/admin/editor-apply',
      icon: ShieldCheck,
      show: !writer,
    },
  ].filter((item) => item.show);

  const closeMobile = () => setMobileOpen(false);

  const handleLogout = async () => {
    if (await logout()) closeMobile();
  };

  const MenuContent = () => (
    <>
      <div className="admin-menu-head">
        <Link className="site-brand" to="/">
          mooncci
        </Link>
        <ThemeToggle />
      </div>
      <p className="admin-user">
        {user?.username} · {getRoleName(role)}
      </p>
      <nav className="admin-menu" aria-label="后台导航">
        {menus.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/admin'}
            onClick={closeMobile}
          >
            <item.icon />
            <span>{item.title}</span>
          </NavLink>
        ))}
        <Link to="/account/settings" onClick={closeMobile}><Settings /><span>个人设置</span></Link>
        <Link to="/" onClick={closeMobile}>
          <Home />
          <span>返回首页</span>
        </Link>
        <button onClick={handleLogout} disabled={loggingOut}>
          <LogOut />
          <span>{loggingOut ? '正在退出…' : '退出登录'}</span>
        </button>
      </nav>
      {logoutError && (
        <p className="admin-user" role="alert">
          {logoutError}
        </p>
      )}
    </>
  );
  return (
    <div className="admin-frame">
      <aside className="admin-sidebar">
        <MenuContent />
      </aside>
      <header className="admin-mobile-bar">
        <Link className="site-brand" to="/">
          mooncci
        </Link>
        <div className="header-actions">
          <ThemeToggle />
          <button
            className="icon-button"
            aria-label={mobileOpen ? '关闭后台菜单' : '打开后台菜单'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {mobileOpen && (
        <div className="admin-mobile-layer">
          <button
            className="admin-menu-backdrop"
            aria-label="关闭菜单"
            onClick={closeMobile}
          />
          <aside>
            <MenuContent />
          </aside>
        </div>
      )}
      <main
        className="admin-main"
        ref={mainRef}
        tabIndex={-1}
        onScroll={(event) => setShowTop(event.currentTarget.scrollTop > 320)}
      >
        <div className="admin-content" key={location.pathname}>
          {children}
        </div>
      </main>
      {showTop && !mobileOpen && (
        <button
          className="admin-back-top"
          type="button"
          onClick={backToTop}
          aria-label="回到页面顶部"
        >
          <ArrowUp size={18} aria-hidden="true" />
          <span>回到顶部</span>
        </button>
      )}
    </div>
  );
}
export default AdminShell;
