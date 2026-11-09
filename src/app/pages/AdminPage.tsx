import { PageHeading } from '../components/ContentUI';
import { useI18n } from '../i18n';
import { useEffect, useState } from 'react';

import {Link} from '../components/LocaleLink';
import {
  Ban,
  FileText,
  AtSign,
  Mailbox,
  KeyRound,
  FilePenLine,
  MessageCircle,
  PenLine,
  Bell,
  Settings,
  UserRoundCheck,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { AdminError } from '../components/admin/AdminState';

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

  return '普通用户可在个人中心的“我的投稿”创建稿件并提交审核；后台编辑权限另行申请。';
}

export default function AdminPage() {
  const { t } = useI18n();
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
  const [statsState, setStatsState] = useState<'loading' | 'ready' | 'error'>(writer ? 'loading' : 'ready');
  const [statsError, setStatsError] = useState('');
  const [statsVersion, setStatsVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      if (!writer) return;
      setStatsState('loading');
      try {
        const result = await api('/admin/stats');
        if (cancelled) return;
        setStats(result);
        setStatsState('ready');
      } catch (error: any) {
        // 统计只是概览信息，失败时仍展示常用操作，但要告诉用户并允许重试。
        if (cancelled) return;
        setStatsError(error?.message || t("m_2c760f406b"));
        setStatsState('error');
      }
    }

    loadStats();

    return () => {
      cancelled = true;
    };
  }, [role, statsVersion]);

  const statCards = [
    {
      title: t("m_bfc51592b2"),
      value: stats.posts,
      icon: FileText,
      show: writer,
    },
    {
      title: t("m_545a676083"),
      value: stats.users,
      icon: Users,
      show: manager,
    },
    {
      title: t("m_fa1ac4351a"),
      value: stats.comments,
      icon: MessageCircle,
      show: manager,
    },
    {
      title: t("m_3a34ce64cd"),
      value: stats.bannedWords,
      icon: Ban,
      show: manager,
    },
  ].filter((item) => item.show);

  const actions = [
{
      title: t("m_4e7cb68111"),
      desc: t("m_51144ab3a7"),
      to: '/admin/posts',
      icon: FileText,
      show: writer,
    },
{
      title: t("m_13b195d6cc"),
      desc: t("m_bbc8fe37f0"),
      to: '/admin/write',
      icon: PenLine,
      show: writer,
    },
{
      title: t("m_e7c87ea7ef"),
      desc: t("m_44484afd3f"),
      to: '/admin/comments',
      icon: MessageCircle,
      show: manager,
    }
  ].filter((item) => item.show);

  return (
    <div>
      <PageHeading variant="admin" back={false} eyebrow={t("m_3797982942")} title={t("m_41119ecad8")}>
        <p>
          {user?.username}，{t(getRoleTip(role))}
        </p>
      </PageHeading>
      {statCards.length > 0 && (
        <section className="admin-stats" aria-label={t("m_5bb7cc1ec1")} aria-busy={statsState === 'loading'}>
          {statCards.map((item) => (
            <div key={item.title}>
              <strong data-pending={statsState !== 'ready'}>{statsState === 'ready' ? item.value : '—'}</strong>
              <span>{item.title}</span>
            </div>
          ))}
        </section>
      )}
      {statsState === 'error' && (
        <AdminError message={t("m_e4f09d658e", {v0: statsError})} onRetry={() => setStatsVersion((value) => value + 1)} />
      )}
      <section>
        <h2>{t("m_e0782ab38f")}</h2>
        <div className="admin-quick-links">
          {actions.map((item) => (
            <Link key={item.to} to={item.to}>
              <item.icon aria-hidden="true" />
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
