import {Tags} from 'lucide-react';
import { LanguageSwitch } from '../LanguageSwitch';
import { useI18n } from '../../i18n';
import { reducedMotion } from '../../lib/motionPreference';
import { focusableWithin, loopFocus } from '../../lib/focusLoop';
import {useOperations} from '../../lib/useOperations';
import '../../../styles/workspace-polish.css';
import '../../../styles/admin-workspace.css';
import {usePublishing} from '../../lib/usePublishing';
import { useSiteSettings } from '../../context/SiteSettingsContext';
import { safeImageSrc } from '../../lib/safeUrl';
import { ThemeToggle } from '../../context/ThemeContext';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {Link} from '../LocaleLink';
import {
  ArrowUp,
  Activity,
  Bell,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ChartNoAxesCombined,
  ContactRound,
  FilePenLine,
  KeyRound,
  Library,
  AtSign,
  Mailbox,
  Newspaper,
  PanelsTopLeft,
  Radio,
  Server,
  Sparkles,
  UserRound,
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
  const { t } = useI18n();
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
      if (event.defaultPrevented || (event.target as Element).closest('.language-menu')) return;
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

  useLayoutEffect(() => {
    const menus = [sidebarRef.current, mobileMenuRef.current]
      .map(root => root?.querySelector<HTMLElement>('.admin-menu'))
      .filter((menu): menu is HTMLElement => !!menu);
    const update = () => menus.forEach(menu => {
      const indicator = menu.querySelector<HTMLElement>('.admin-menu-indicator');
      const active = menu.querySelector<HTMLElement>('.admin-menu-group a[aria-current="page"]');
      if (!indicator) return;
      if (!active || active.getClientRects().length === 0) {
        indicator.hidden = true;
        return;
      }
      const menuRect = menu.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      indicator.hidden = false;
      indicator.style.transform = `translateY(${activeRect.top - menuRect.top}px)`;
      indicator.style.height = `${activeRect.height}px`;
    });
    update();
    const frame = requestAnimationFrame(() => menus.forEach(menu => { menu.dataset.indicatorReady = 'true'; }));
    const observer = new ResizeObserver(update);
    menus.forEach(menu => { observer.observe(menu); menu.addEventListener('toggle', update, true); });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      menus.forEach(menu => menu.removeEventListener('toggle', update, true));
      window.removeEventListener('resize', update);
    };
  }, [location.pathname, mobileOpen, role, operations, publishing]);

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

  const menuGroups: {label: string; defaultOpen?: boolean; items: MenuItem[]}[] = [
    {label:t("m_f9e02d3c13"), defaultOpen:true, items:[
      {title:t("m_59d4b08f74"),to:'/admin/operations',icon:ChartNoAxesCombined,show:manager&&operations},
      { title: t("m_fea405f9b0"), to: '/admin', icon: LayoutDashboard, show: true },
      { title: t("m_3943942fd1"), to: '/admin/analytics', icon: ChartColumn, show: manager }
    ]},
    {label:t("m_8aa8833150"), items:[
      { title: t("m_4e7cb68111"), to: '/admin/posts', icon: FileText, show: writer },
      {title:t('m_3fcdff8677'),to:'/admin/taxonomy',icon:Tags,show:manager},
      { title: t("m_13b195d6cc"), to: '/admin/write', icon: PenLine, show: writer },
      {title:t("m_fd95a33a4e"),to:'/admin/reviews',icon:Inbox,show:manager&&publishing},
      {title:t("m_7f43c0e706"),to:'/admin/schedules',icon:CalendarClock,show:manager&&publishing},
      {title:t("m_9b9471ee60"),to:'/admin/series',icon:Library,show:manager&&publishing},
      { title: t("m_d771576fc0"), to: '/admin/media', icon: Image, show: manager },
      { title: t("m_010469b6ab"), to: '/admin/updates', icon: Radio, show: manager },
      { title: t("m_831ed48e52"), to: '/admin/projects', icon: PanelsTopLeft, show: manager }
    ]},
    {label:t("m_b6905624e3"), items:[
      { title: t("m_e7c87ea7ef"), to: '/admin/comments', icon: MessageCircle, show: manager },
      { title: t("m_fbf413d429"), to: '/admin/users', icon: Users, show: manager },
      { title: t("m_70dfdc8440"), to: '/admin/editor-applications', icon: UserRoundCheck, show: manager },
      { title: t("m_170c6b52b8"), to: '/admin/editor-apply', icon: FilePenLine, show: !writer },
      { title: t("m_e2c664697f"), to: '/admin/banned-words', icon: Ban, show: manager }
    ]},
    {label:t("m_25112963d4"), items:[
      { title: t("m_2d7256702a"), to: '/admin/mailbox', icon: Mailbox, show: user?.role === 'owner' },
      { title: t("m_41f3c254fe"), to: '/admin/mailbox-requests', icon: ShieldCheck, show: user?.role === 'owner' },
      { title: t("m_87594d4a43"), to: '/admin/newsletter', icon: Newspaper, show: owner },
      { title: t("m_177aab06c8"), to: '/admin/mail-settings', icon: AtSign, show: manager },
      { title: t("m_2ea2bbfe61"), to: '/admin/send-mail', icon: Bell, show: manager }
    ]},
    {label:t("m_95dbef1fb4"), items:[
      {title:t("m_85857d157f"),to:'/admin/festivals',icon:CalendarDays,show:manager},
      {title:t("m_54531f63f4"),to:'/admin/ai-settings',icon:Sparkles,show:user?.role==='owner'},
      {title:t("m_07e96c1e12"),to:"/admin/node-monitor",icon:Server,show:owner},
      { title: t("m_aa52ce6f17"), to: '/admin/blog-pages', icon: ContactRound, show: manager },
      { title: t("m_f0cac3fe1a"), to: '/admin/site-settings', icon: Settings, show: manager },
      {
      title: t("m_e37441c86c"),
      desc: t("m_968815165c"),
      to: '/admin/login-settings',
      icon: KeyRound,
      show: user?.role === 'owner',
    },
      { title: t("m_af99c07be8"), to: '/admin/electricity', icon: Zap, show: owner },
      { to: '/admin/runtime', title: t("m_0020a68469"), icon: Activity, show: isManager(role) }
    ]}
  ].map(group => ({...group, items: group.items.filter(item => item.show)})).filter(group => group.items.length);

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
        <div className="admin-menu-head-actions"><ThemeToggle />{mobile && <button className="icon-button" type="button" aria-label={t("m_5d12cf5118")} onClick={closeMobile}><X /></button>}</div>
      </div>
      <p className="admin-user">
        {user?.username} · {t(getRoleName(role))}
      </p>
      <div className="navigation-language-row"><span>{t("m_3d13868593")}</span><LanguageSwitch /></div>
      <nav className="admin-menu" aria-label={t("m_92922c76c0")}>
        <span className="admin-menu-indicator" aria-hidden="true" hidden />
        {menuGroups.map(group => <details className="admin-menu-group" key={group.label+location.pathname} open={group.defaultOpen || group.items.some(item => item.to === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(item.to))}>
          <summary>{group.label}</summary>
          {group.items.map(item => <NavLink key={item.to} to={item.to} end={item.to === '/admin'} onClick={closeMobile}><item.icon aria-hidden="true"/><span>{item.title}</span></NavLink>)}
        </details>)}
        <div className="admin-menu-footer">
        <Link to="/account/settings" onClick={closeMobile}><UserRound aria-hidden="true"/><span>{t("m_c2952a5ffc")}</span></Link>
        <Link to="/" onClick={closeMobile}>
          <Home />
          <span>{t("m_d66f4359da")}</span>
        </Link>
        <button onClick={handleLogout} disabled={loggingOut}>
          <LogOut />
          <span>{loggingOut ? t("m_0ae60dd37b") : t("m_3ab8cc1593")}</span>
        </button>
        </div>
      </nav>
      {logoutError && (
        <p className="admin-user" role="alert">
          {t(logoutError || '')}
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
            aria-label={mobileOpen ? t("m_5d12cf5118") : t("m_4aab8028f3")}
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
            aria-label={t("m_be0d5706c6")}
            tabIndex={-1}
            onClick={closeMobile}
          />
          <aside id="admin-mobile-menu" ref={mobileMenuRef} role="dialog" aria-modal="true" aria-label={t("m_92922c76c0")} tabIndex={-1}>
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
          aria-label={t("m_75a898fd64")}
        >
          <ArrowUp size={18} aria-hidden="true" />
          <span>{t("m_53d77f5654")}</span>
        </button>
      )}
    </div>
  );
}
export default AdminShell;
