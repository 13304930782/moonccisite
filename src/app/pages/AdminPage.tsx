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
        if (!writer) return;
        const result = await api('/admin/stats');
        if (!cancelled) setStats(result);
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
    <div>
      <header className="admin-overview-head">
        <p className="eyebrow">工作区</p>
        <h1>后台管理</h1>
        <p>
          {user?.username}，{getRoleTip(role)}
        </p>
      </header>
      {statCards.length > 0 && (
        <section className="admin-stats" aria-label="内容统计">
          {statCards.map((item) => (
            <div key={item.title}>
              <strong>{item.value}</strong>
              <span>{item.title}</span>
            </div>
          ))}
        </section>
      )}
      <section>
        <h2>常用操作</h2>
        <div className="admin-quick-links">
          {actions.map((item) => (
            <Link key={item.to} to={item.to}>
              <item.icon />
              <div>
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
