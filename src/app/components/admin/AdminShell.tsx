import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  Ban,
  Crown,
  FileText,
  Home,
  Image,
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
    return 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-purple-500/30';
  }

  if (role === 'admin') {
    return 'bg-blue-600 text-white shadow-blue-500/30';
  }

  if (role === 'editor') {
    return 'bg-emerald-600 text-white shadow-emerald-500/30';
  }

  return 'bg-white/10 text-white';
}

function isManager(role?: string) {
  return role === 'owner' || role === 'admin';
}

function canWrite(role?: string) {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

export function AdminShell({ children }: AdminShellProps) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = user?.role || 'user';
  const manager = isManager(role);
  const writer = canWrite(role);

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
      show: writer,
    },
    {
      title: '编辑申请审核',
      to: '/admin/editor-applications',
      icon: UserRoundCheck,
      show: manager,
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

  const handleLogout = () => {
    logout();
    closeMobile();
  };

  const MenuContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex h-full min-h-0 w-full flex-col">
      <Link
        to="/"
        onClick={() => mobile && closeMobile()}
        className="flex shrink-0 items-center gap-3 px-2"
      >
        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600">
          <img
            src="/api/uploads/logo.png"
            alt="logo"
            className="h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.style.display = 'none';
            }}
          />
        </div>

        <div className="min-w-0">
          <div className="truncate font-bold text-gray-900">计算机博客</div>
          <div className="truncate text-xs text-gray-500">Control Center</div>
        </div>
      </Link>

      <div className="mt-8 shrink-0 rounded-3xl bg-gradient-to-br from-gray-950 to-blue-950 p-5 text-white shadow-lg">
        <div className="text-sm text-white/70">当前用户</div>

        <div className="mt-3 truncate font-bold">
          {user?.username || '未登录'}
        </div>

        <div className="mt-3">
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold shadow-lg ${getRoleBadgeClass(role)}`}>
            {role === 'owner' && <Crown className="h-3.5 w-3.5" />}
            {getRoleName(role)}
          </span>
        </div>
      </div>

      <nav className="mt-6 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]">
        {menus.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/admin'}
              onClick={() => mobile && closeMobile()}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition',
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                ].join(' ')
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.title}</span>
            </NavLink>
          );
        })}

        <Link
          to="/"
          onClick={() => mobile && closeMobile()}
          className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-gray-600 transition hover:bg-gray-100 hover:text-gray-900"
        >
          <Home className="h-4 w-4 shrink-0" />
          <span>返回首页</span>
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm text-red-600 transition hover:bg-red-50"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>退出登录</span>
        </button>
      </nav>
    </div>
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-gray-100 text-gray-900 lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="hidden min-h-0 overflow-hidden border-r border-gray-200/70 bg-white/75 p-5 backdrop-blur-xl lg:flex">
        <MenuContent />
      </aside>

      <header className="fixed left-0 right-0 top-0 z-50 border-b border-gray-200/70 bg-white/90 px-4 py-3 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600">
              <img
                src="/api/uploads/logo.png"
                alt="logo"
                className="h-full w-full object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
            </div>

            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-gray-900">
                后台管理
              </div>
              <div className="truncate text-xs text-gray-500">
                {user?.username || '未登录'} · {getRoleName(role)}
              </div>
            </div>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/"
              className="inline-flex items-center gap-1 rounded-2xl bg-gray-100 px-3 py-2 text-xs text-gray-700"
            >
              <Home className="h-4 w-4" />
              首页
            </Link>

            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="inline-flex items-center gap-1 rounded-2xl bg-blue-600 px-3 py-2 text-xs text-white"
            >
              <Menu className="h-4 w-4" />
              菜单
            </button>
          </div>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-[60] overflow-hidden lg:hidden">
          <button
            type="button"
            aria-label="关闭菜单"
            className="absolute inset-0 bg-black/40"
            onClick={closeMobile}
          />

          <aside className="absolute inset-y-0 left-0 flex w-80 max-w-[86vw] flex-col overflow-hidden bg-white p-5 shadow-2xl">
            <div className="mb-5 flex shrink-0 items-center justify-between">
              <div className="text-sm font-semibold text-gray-500">后台菜单</div>
              <button
                type="button"
                onClick={closeMobile}
                className="rounded-xl bg-gray-100 p-2 text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="h-[calc(100%-3.5rem)] min-h-0">
              <MenuContent mobile />
            </div>
          </aside>
        </div>
      )}

      <main className="absolute inset-x-0 bottom-0 top-[73px] overflow-y-auto overscroll-contain px-4 pb-6 pt-6 [-webkit-overflow-scrolling:touch] lg:static lg:min-h-0 lg:px-10 lg:py-6">
        <div className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}

export default AdminShell;
