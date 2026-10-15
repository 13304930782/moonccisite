import { reducedMotion } from '../../lib/motionPreference';
import {useOperations} from '../../lib/useOperations';
import '../../../styles/workspace-polish.css';
import '../../../styles/admin-shell.css';
import {usePublishing} from '../../lib/usePublishing';
import { AdminButton } from './AdminButton';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '../ui/sheet';
import { ThemeToggle } from '../../context/ThemeContext';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  ArrowUp,
  ChevronDown,
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
  MoreHorizontal,
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
      behavior: reducedMotion()
        ? 'instant'
        : 'smooth',
    });
  }

  const { user, logout, loggingOut, logoutError } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setMobileOpen(false);
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' });
    setShowTop(false);
  }, [location.pathname]);
  useEffect(() => {
    const media = window.matchMedia('(max-width:900px)');
    const resize = () => { if (!media.matches) setMobileOpen(false); };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);

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
{title:"节点监控",to:"/admin/node-monitor",icon:Gauge,show:owner},
{title:'运营概览',to:'/admin/operations',icon:Gauge,show:manager&&operations},
{title:'投稿审核',to:'/admin/reviews',icon:Inbox,show:manager&&publishing},
{title:'发布计划',to:'/admin/schedules',icon:Send,show:manager&&publishing},
{title:'专栏管理',to:'/admin/series',icon:FileText,show:manager&&publishing},
    { title: '访问统计', to: '/admin/analytics', icon: Gauge, show: manager },
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
      title: '关于与友链', to: '/admin/blog-pages', icon: Settings, show: manager,
    },
    { to: '/admin/runtime', title: '运行信息', icon: Gauge, show: isManager(role) },
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
    {title:'AI 文章简介',to:'/admin/ai-settings',icon:Settings,show:user?.role==='owner'},
    {
      title: '邮件设置',
      to: '/admin/mail-settings',
      icon: Mail,
      show: manager,
    },
    {
      title: '站点通知',
      to: '/admin/send-mail',
      icon: Send,
      show: manager,
    },
    {
      title: '我的邮箱',
      to: '/admin/mailbox',
      icon: Mail,
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
      icon: ShieldCheck,
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
        <div className="admin-menu-head-actions"><ThemeToggle />{mobile && <SheetClose asChild><AdminButton variant="ghost" size="icon" aria-label="关闭后台菜单"><X /></AdminButton></SheetClose>}</div>
      </div>
      <nav className="admin-menu" aria-label="后台导航">
        {[
          {label:'工作台',paths:['/admin/operations','/admin','/admin/analytics']},
          {label:'内容与发布',paths:['/admin/posts','/admin/write','/admin/reviews','/admin/schedules','/admin/series','/admin/media','/admin/updates','/admin/projects']},
          {label:'用户与互动',paths:['/admin/comments','/admin/users','/admin/editor-applications','/admin/editor-apply','/admin/early-access','/admin/banned-words']},
          {label:'邮件与订阅',paths:['/admin/mailbox','/admin/mailbox-requests','/admin/newsletter','/admin/mail-settings','/admin/send-mail']},
          {label:'站点与系统',paths:['/admin/ai-settings','/admin/node-monitor','/admin/blog-pages','/admin/site-settings','/admin/login-settings','/admin/electricity','/admin/runtime']},
        ].map(group=>{const items=group.paths.map(path=>menus.find(item=>item.to===path)).filter((item):item is MenuItem=>!!item);if(!items.length)return null;return <details className="admin-menu-group" key={group.label+location.pathname} open={group.label==='工作台'||items.some(item=>item.to==='/admin'?location.pathname==='/admin':location.pathname.startsWith(item.to))}><summary><span>{group.label}</span><ChevronDown className="admin-group-chevron" aria-hidden="true"/></summary>{items.map(item=><NavLink className="admin-nav-link" key={item.to} to={item.to} end={item.to==='/admin'} onClick={closeMobile}><span className="admin-nav-item"><item.icon aria-hidden="true"/><span>{item.title}</span></span></NavLink>)}</details>;})}
      </nav>
      <div className="admin-user-card">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="admin-user-trigger" aria-label={`${user?.username || ''}，${getRoleName(role)}，打开账户菜单`}>
              <Avatar className="admin-user-avatar"><AvatarFallback>{Array.from(user?.username || '?')[0].toLocaleUpperCase()}</AvatarFallback></Avatar>
              <span className="admin-user-identity"><strong>{user?.username}</strong><span>{getRoleName(role)}</span></span>
              <MoreHorizontal size={18} aria-hidden="true"/>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="admin-portal admin-user-dropdown" side="top" align="start" sideOffset={8}>
            <DropdownMenuItem asChild><Link to="/account/settings" onClick={closeMobile}><Settings aria-hidden="true"/>个人设置</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/" onClick={closeMobile}><Home aria-hidden="true"/>返回首页</Link></DropdownMenuItem>
            <DropdownMenuItem disabled={loggingOut} onSelect={() => { void handleLogout(); }}><LogOut aria-hidden="true"/>{loggingOut ? '正在退出…' : '退出登录'}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      {logoutError && (
        <p className="admin-user" role="alert">
          {logoutError}
        </p>
      )}
      </div>
    </>
  );
  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
    <div className="admin-frame">
      <aside className="admin-sidebar">
        {MenuContent()}
      </aside>
      <header className="admin-mobile-bar">
        <Link className="site-brand" to="/">
          mooncci
        </Link>
        <div className="header-actions">
          <ThemeToggle />
          <SheetTrigger asChild><AdminButton
            variant="ghost" size="icon"
            aria-label={mobileOpen ? '关闭后台菜单' : '打开后台菜单'}
          >
            {mobileOpen ? <X /> : <Menu />}
          </AdminButton></SheetTrigger>
        </div>
      </header>
      <SheetContent side="left" className="admin-portal admin-sheet" aria-describedby={undefined}>
        <SheetTitle className="sr-only">后台导航</SheetTitle>
        {MenuContent({mobile:true})}
      </SheetContent>
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
    </Sheet>
  );
}
export default AdminShell;
