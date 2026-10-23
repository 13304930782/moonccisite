import { reducedMotion } from '../../lib/motionPreference';
import { focusableWithin, loopFocus } from '../../lib/focusLoop';
import {useOperations} from '../../lib/useOperations';
import '../../../styles/workspace-polish.css';
import '../../../styles/admin-workspace.css';
import {usePublishing} from '../../lib/usePublishing';
import { useSiteSettings } from '../../context/SiteSettingsContext';
import { safeImageSrc } from '../../lib/safeUrl';
import { ThemeToggle } from '../../context/ThemeContext';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  ArrowUp,
  Activity,
  BellRing,
  CalendarClock,
  ChartColumn,
  ChartNoAxesCombined,
  ContactRound,
  FilePenLine,
  FlaskConical,
  KeyRound,
  Library,
  AtSign,
  Mailbox,
  Newspaper,
  PanelsTopLeft,
  Radio,
  Server,
  Sparkles,
  UserRoundCog,
  Zap,
  Ban,
  FileText,
  Home,
  Image,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  PenLine,
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
  const sidebarRef = useRef<HTMLElement>(null), mobileBarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null), mobileMenuRef = useRef<HTMLElement>(null);
  const [showTop, setShowTop] = useState(false);
  function backToTop() {
    const main = mainRef.current;
    if (!main) return;
    const heading = main.querySelector<HTMLElement>('h1') || main;
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
    main.scrollTo({
      top: 0,
      behavior: reducedMotion()
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
    const media = window.matchMedia('(max-width:760px)');
    const resize = () => { if (!media.matches) setMobileOpen(false); };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const background = [mainRef.current, sidebarRef.current, mobileBarRef.current]
      .filter((element): element is HTMLElement => !!element);
    const previous = background.map(element => element.inert);
    background.forEach(element => { element.inert = true; });
    const frame = requestAnimationFrame(() => {
      const menu = mobileMenuRef.current;
      if (menu) (focusableWithin(menu)[0] || menu).focus({preventScroll:true});
    });
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMobileOpen(false); }
      else if (mobileMenuRef.current) loopFocus(event, mobileMenuRef.current);
    };
    window.addEventListener('keydown', keys);
    return () => {
      cancelAnimationFrame(frame); window.removeEventListener('keydown', keys);
      background.forEach((element, index) => { element.inert = previous[index]; });
      if (menuButtonRef.current?.offsetParent) menuButtonRef.current.focus({preventScroll:true});
    };
  }, [mobileOpen]);

  const role = user?.role || 'user';
  const manager = isManager(role);
  const publishing = usePublishing();
  const operations = useOperations();
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
{title:"节点监控",to:"/admin/node-monitor",icon:Server,show:owner},
{title:'运营概览',to:'/admin/operations',icon:ChartNoAxesCombined,show:manager&&operations},
{title:'投稿审核',to:'/admin/reviews',icon:Inbox,show:manager&&publishing},
{title:'发布计划',to:'/admin/schedules',icon:CalendarClock,show:manager&&publishing},
{title:'专栏管理',to:'/admin/series',icon:Library,show:manager&&publishing},
    { title: '访问统计', to: '/admin/analytics', icon: ChartColumn, show: manager },
    {
      title: '近况与动态',
      to: '/admin/updates',
      icon: Radio,
      show: manager,
    },
    { title: '作品管理', to: '/admin/projects', icon: PanelsTopLeft, show: manager },
    { title: '订阅与周报', to: '/admin/newsletter', icon: Newspaper, show: owner },
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
      icon: FlaskConical,
      show: owner,
    },
    {
      title: '水电监控设置',
      to: '/admin/electricity',
      icon: Zap,
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
      title: '关于与友链', to: '/admin/blog-pages', icon: ContactRound, show: manager,
    },
    { to: '/admin/runtime', title: '运行信息', icon: Activity, show: isManager(role) },
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
      icon: KeyRound,
      show: user?.role === 'owner',
    },
    {title:'AI 文章简介',to:'/admin/ai-settings',icon:Sparkles,show:user?.role==='owner'},
    {
      title: '邮件设置',
      to: '/admin/mail-settings',
      icon: AtSign,
      show: manager,
    },
    {
      title: '站点通知',
      to: '/admin/send-mail',
      icon: BellRing,
      show: manager,
    },
    {
      title: '我的邮箱',
      to: '/admin/mailbox',
      icon: Mailbox,
      show: user?.role === 'owner',
    },
    {
      title: '邮箱申请与权限',
      to: '/admin/mailbox-requests',
      icon: ShieldCheck,
      show: user?.role === 'owner',
    },
    {
      title: '编辑申请',
      to: '/admin/editor-apply',
      icon: FilePenLine,
      show: !writer,
    },
  ].filter((item) => item.show);

  const closeMobile = () => setMobileOpen(false);

  const handleLogout = async () => {
    if (await logout()) closeMobile();
  };

  const MenuContent = ({mobile = false}: {mobile?: boolean} = {}) => (
    <>
      <div className="admin-menu-head">
        <Link className="site-brand" to="/">
          mooncci
        </Link>
        <div className="admin-menu-head-actions"><ThemeToggle />{mobile && <button className="icon-button" type="button" aria-label="关闭后台菜单" onClick={closeMobile}><X /></button>}</div>
      </div>
      <p className="admin-user">
        {user?.username} · {getRoleName(role)}
      </p>
      <nav className="admin-menu" aria-label="后台导航">
        {[
          {label:'工作台',paths:['/admin/operations','/admin','/admin/analytics']},
          {label:'内容与发布',paths:['/admin/posts','/admin/write','/admin/reviews','/admin/schedules','/admin/series','/admin/media','/admin/updates','/admin/projects']},
          {label:'用户与互动',paths:['/admin/comments','/admin/users','/admin/editor-applications','/admin/editor-apply','/admin/early-access','/admin/banned-words']},
          {label:'邮件与订阅',paths:['/admin/mailbox','/admin/mailbox-requests','/admin/newsletter','/admin/mail-settings','/admin/send-mail']},
          {label:'站点与系统',paths:['/admin/ai-settings','/admin/node-monitor','/admin/blog-pages','/admin/site-settings','/admin/login-settings','/admin/electricity','/admin/runtime']},
        ].map(group=>{const items=group.paths.map(path=>menus.find(item=>item.to===path)).filter((item):item is MenuItem=>!!item);if(!items.length)return null;return <details className="admin-menu-group" key={group.label+location.pathname} open={group.label==='工作台'||items.some(item=>item.to==='/admin'?location.pathname==='/admin':location.pathname.startsWith(item.to))}><summary>{group.label}</summary>{items.map(item=><NavLink key={item.to} to={item.to} end={item.to==='/admin'} onClick={closeMobile}><item.icon aria-hidden="true"/><span>{item.title}</span></NavLink>)}</details>;})}
        <div className="admin-menu-footer">
        <Link to="/account/settings" onClick={closeMobile}><UserRoundCog aria-hidden="true"/><span>个人设置</span></Link>
        <Link to="/" onClick={closeMobile}>
          <Home />
          <span>返回首页</span>
        </Link>
        <button onClick={handleLogout} disabled={loggingOut}>
          <LogOut />
          <span>{loggingOut ? '正在退出…' : '退出登录'}</span>
        </button>
        </div>
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
      <aside className="admin-sidebar" ref={sidebarRef}>
        {MenuContent()}
      </aside>
      <header className="admin-mobile-bar" ref={mobileBarRef}>
        <Link className="site-brand" to="/">
          mooncci
        </Link>
        <div className="header-actions">
          <ThemeToggle />
          <button
            ref={menuButtonRef}
            className="icon-button"
            aria-label={mobileOpen ? '关闭后台菜单' : '打开后台菜单'}
            aria-expanded={mobileOpen}
            aria-controls="admin-mobile-menu"
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
            tabIndex={-1}
            onClick={closeMobile}
          />
          <aside id="admin-mobile-menu" ref={mobileMenuRef} role="dialog" aria-modal="true" aria-label="后台导航" tabIndex={-1}>
            {MenuContent({mobile:true})}
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
