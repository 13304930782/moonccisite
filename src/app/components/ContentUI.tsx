import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Header } from './Header';
import { SiteFooter } from './SiteFooter';

export type PageData<T = any> = { items: T[]; total: number; page: number; pageSize: number };
export function useResource<T = any>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setData(null);
    api(path)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  return { data, error, loading, reload };
}
export function ResourceState({
  resource,
  children,
}: {
  resource: ReturnType<typeof useResource>;
  children: ReactNode;
}) {
  if (resource.loading)
    return (
      <p className="quiet-state" role="status">
        正在加载…
      </p>
    );
  if (resource.error)
    return (
      <div className="quiet-state" role="alert">
        <p>{resource.error}</p>
        <button className="quiet-button" onClick={resource.reload}>
          重试
        </button>
      </div>
    );
  return <>{children}</>;
}
export function SitePage({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className="neo-page">
      <Header />
      <main className={`site-container page-content ${narrow ? 'reading-page' : ''}`}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}
export function formatDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value.slice(0, 10)
    : date.toLocaleDateString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
}
export const labels: Record<string, string> = {
  post: '文章',
  update: '近况',
  release: '项目版本',
  building: '开发中',
  active: '持续维护',
  maintenance: '维护阶段',
  archived: '已归档',
  draft: '草稿',
  published: '已发布',
  pending: '待处理',
  sent: '已发送',
  failed: '失败',
  uncertain: '待核对',
  sending: '发送中',
  skipped: '已跳过',
  unsubscribed: '已退订',
};
export function ActivityList({ items }: { items: any[] }) {
  return (
    <div className="activity-list">
      {!items.length && <p className="quiet-state">暂时没有更新。</p>}
      {items.map((item) => (
        <Link to={item.path} className="activity-row" key={item.activity_id}>
          <div className="activity-meta">
            <span>{labels[item.type]}</span>
            <time>{formatDate(item.published_at)}</time>
          </div>
          <div>
            <h3>{item.title}</h3>
            <p>{item.excerpt}</p>
            {item.type === 'release' && <small className="muted">来自 GitHub Releases</small>}
          </div>
          <span aria-hidden="true">↗</span>
        </Link>
      ))}
    </div>
  );
}
export function Pagination({ data, onPage }: { data: PageData; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <nav className="pagination" aria-label="分页">
      <button disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>
        上一页
      </button>
      <span>
        {data.page} / {pages}
      </span>
      <button disabled={data.page >= pages} onClick={() => onPage(data.page + 1)}>
        下一页
      </button>
    </nav>
  );
}
export function SubscribeForm() {
  const [email, setEmail] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const status = useResource('/subscriptions/status');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await api('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMessage(result.message);
      setEmail('');
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="subscribe-section" id="subscribe">
      <div>
        <p className="eyebrow">KEEP IN TOUCH</p>
        <h2>有新的记录时，再见。</h2>
        <p className="muted">每周一，一封关于文章、近况与作品的摘要。无更新不打扰。</p>
        <Link className="text-link" to="/rss">
          通过 RSS 订阅 ↗
        </Link>
      </div>
      <div>
        {status.data?.available ? (
          <form onSubmit={submit}>
            <label htmlFor="subscribe-email">邮箱地址</label>
            <div className="subscribe-form">
              <input
                id="subscribe-email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <button disabled={busy}>{busy ? '正在提交…' : '订阅周报'}</button>
            </div>
            <small className="muted">确认邮箱后生效，随时可以退订。</small>
          </form>
        ) : (
          <p className="muted">
            {status.error
              ? '邮件订阅状态暂不可用。'
              : status.loading
                ? '正在检查订阅状态…'
                : '邮件订阅尚未开放，欢迎先使用 RSS。'}
          </p>
        )}
        <p role="status" className="form-message">
          {message}
        </p>
      </div>
    </section>
  );
}
