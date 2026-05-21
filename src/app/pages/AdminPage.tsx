import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ban,
  Crown,
  FileText,
  Mail,
  MessageCircle,
  PenLine,
  Send,
  Settings,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

function getRoleName(role?: string) {
  if (role === 'owner') return '站长';
  if (role === 'admin') return '管理员';
  if (role === 'editor') return '编辑';
  return '普通用户';
}

function isManager(role?: string) {
  return role === 'owner' || role === 'admin';
}

function canWrite(role?: string) {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

function getRoleTip(role?: string) {
  if (role === 'owner') {
    return '你当前是站长账号，拥有最高权限：可写文章、审核评论、管理用户、设置站点和邮件提醒。';
  }

  if (role === 'admin') {
    return '你当前是管理员账号，可以审核评论、管理用户、设置站点并管理内容。';
  }

  if (role === 'editor') {
    return '你当前是编辑账号，可以写文章，评论无需审核。';
  }

  return '你当前是普通用户，可以评论文章，但暂时不能写文章。想发布文章，请先提交编辑申请。';
}

export default function AdminPage() {
  const { user } = useAuth();

  const role = user?.role || 'user';
  const manager = isManager(role);
  const writer = canWrite(role);

  const [stats, setStats] = useState({
    posts: 0,
    users: 0,
    comments: 0,
    bannedWords: 0,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      try {
        const results = await Promise.allSettled([
          writer ? api('/admin/posts') : Promise.resolve([]),
          manager ? api('/admin/users') : Promise.resolve([]),
          manager ? api('/admin/comments?status=all') : Promise.resolve([]),
          manager ? api('/admin/banned-words') : Promise.resolve([]),
        ]);

        if (cancelled) return;

        const getLength = (index: number) => {
          const item = results[index];

          if (item.status !== 'fulfilled') return 0;
          return Array.isArray(item.value) ? item.value.length : 0;
        };

        setStats({
          posts: getLength(0),
          users: getLength(1),
          comments: getLength(2),
          bannedWords: getLength(3),
        });
      } catch {
        // 不影响页面显示
      }
    }

    loadStats();

    return () => {
      cancelled = true;
    };
  }, [role]);

  const statCards = [
    {
      title: '文章总数',
      value: stats.posts,
      icon: FileText,
      show: writer,
    },
    {
      title: '用户总数',
      value: stats.users,
      icon: Users,
      show: manager,
    },
    {
      title: '评论总数',
      value: stats.comments,
      icon: MessageCircle,
      show: manager,
    },
    {
      title: '违禁词总数',
      value: stats.bannedWords,
      icon: Ban,
      show: manager,
    },
  ].filter((item) => item.show);

  const actions = [
    {
      title: '文章管理',
      desc: '查看、编辑和管理文章',
      to: '/admin/posts',
      icon: FileText,
      show: writer,
    },
    {
      title: '写文章',
      desc: '发布新的博客文章',
      to: '/admin/write',
      icon: PenLine,
      show: writer,
    },
    {
      title: '评论管理',
      desc: '审核、通过、驳回或删除评论',
      to: '/admin/comments',
      icon: MessageCircle,
      show: manager,
    },
    {
      title: '用户管理',
      desc: '管理用户身份、评论权限和账号状态',
      to: '/admin/users',
      icon: Users,
      show: manager,
    },
    {
      title: '编辑申请审核',
      desc: '审核普通用户的编辑申请',
      to: '/admin/editor-applications',
      icon: UserRoundCheck,
      show: manager,
    },
    {
      title: '违禁词设置',
      desc: '设置评论违禁词和拦截规则',
      to: '/admin/banned-words',
      icon: Ban,
      show: manager,
    },
    {
      title: '站点设置',
      desc: '修改网站标题、Logo、备案和首页资料',
      to: '/admin/site-settings',
      icon: Settings,
      show: manager,
    },
    {
      title: '邮件设置',
      desc: '配置 SMTP、评论提醒和审核通知',
      to: '/admin/mail-settings',
      icon: Mail,
      show: manager,
    },
    {
      title: '发送邮件',
      desc: '使用后台 SMTP 配置，手动给指定邮箱发送邮件',
      to: '/admin/send-mail',
      icon: Send,
      show: manager,
    },
    {
      title: '申请成为编辑',
      desc: '提交申请，通过后即可写文章',
      to: '/admin/editor-apply',
      icon: ShieldCheck,
      show: !writer,
    },
  ].filter((item) => item.show);

  return (
    <div className="space-y-8">
      <section className="rounded-[2rem] bg-gradient-to-br from-gray-950 via-purple-950 to-blue-950 p-8 text-white shadow-xl">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm">
          {role === 'owner' ? <Crown className="h-4 w-4 text-yellow-300" /> : <ShieldCheck className="h-4 w-4" />}
          Mooncci Control Center
        </div>

        <h1 className="mt-6 text-4xl font-black tracking-tight md:text-5xl">
          后台管理
        </h1>

        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-white/80">当前登录：</span>
          <span className="font-semibold">{user?.username || '未登录'}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white">
            {role === 'owner' && <Crown className="h-3.5 w-3.5 text-yellow-300" />}
            {getRoleName(role)}
          </span>
        </div>
      </section>

      <section className="rounded-3xl border border-blue-100 bg-blue-50 px-6 py-5 text-blue-700">
        {getRoleTip(role)}
      </section>

      {statCards.length > 0 && (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {statCards.map((item) => {
            const Icon = item.icon;

            return (
              <div key={item.title} className="rounded-3xl bg-white/80 p-6 shadow-lg shadow-black/5">
                <div className="flex items-center justify-between">
                  <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="text-3xl font-black text-gray-900">
                    {item.value}
                  </div>
                </div>

                <div className="mt-4 text-sm text-gray-500">{item.title}</div>
              </div>
            );
          })}
        </section>
      )}

      <section className="rounded-[2rem] bg-white/80 p-8 shadow-lg shadow-black/5">
        <h2 className="text-2xl font-bold text-gray-900">快捷操作</h2>
        <p className="mt-2 text-sm text-gray-500">
          根据你的角色显示可用功能。
        </p>

        <div className="mt-7 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {actions.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.to}
                to={item.to}
                className="group rounded-3xl border border-gray-200 bg-white/80 p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg">
                  <Icon className="h-6 w-6" />
                </div>

                <h3 className="mt-5 text-lg font-semibold text-gray-900 transition-colors group-hover:text-blue-600">
                  {item.title}
                </h3>

                <p className="mt-2 text-sm leading-6 text-gray-500">
                  {item.desc}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
