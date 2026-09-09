import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { Header } from './Header';
import { SiteFooter } from './SiteFooter';

export type PageData<T = any> = { items: T[]; total: number; page: number; pageSize: number };
// Only published, user-independent endpoints may share an in-memory snapshot.
const publicSnapshots = new Map<string, { data: any; time: number }>();
const cacheable = (path: string) => /^\/(now|activity|projects|updates)(?:[/?]|$)/.test(path);
export function useResource<T = any>(path: string) {
  const cached = cacheable(path) ? publicSnapshots.get(path) : undefined;
  const snapshot = cached && Date.now() - cached.time < 30000 ? cached.data : null;
  const [state, setState] = useState<{ path: string; data: T | null }>({ path, data: snapshot }),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setState(current => current.path === path ? current : { path, data: snapshot });
    api(path)
      .then((v) => {
        if (active) {
          setState({ path, data: v });
          if (cacheable(path)) {
            if (publicSnapshots.size >= 40) publicSnapshots.delete(publicSnapshots.keys().next().value!);
            publicSnapshots.set(path, { data: v, time: Date.now() });
          }
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          if ([401, 403, 404].includes(e.status)) {
            publicSnapshots.delete(path);
            setState({ path, data: null });
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  return { data: state.path === path ? state.data : snapshot, error: state.path === path ? error : '', loading: loading || state.path !== path, reload };
}
export function ContentSkeleton() {
  return <div className="content-skeleton" role="status" aria-label="正在加载内容" aria-busy="true">
    <span className="skeleton-line skeleton-heading" /><span className="skeleton-line" />
    <span className="skeleton-line" /><span className="skeleton-block" />
    <span className="sr-only">正在加载内容…</span>
  </div>;
}
export function ResourceState({
  resource,
  children,
}: {
  resource: ReturnType<typeof useResource>;
  children: ReactNode;
}) {
  if (resource.loading && resource.data === null) return <ContentSkeleton />;
  if (resource.error && resource.data === null)
    return (
      <div className="quiet-state" role="alert">
        <p>{resource.error}</p>
        <button className="quiet-button" onClick={resource.reload}>
          重试
        </button>
      </div>
    );
  return <div className="resource-content" aria-busy={resource.loading}>
    {resource.error && <p className="muted" role="status">暂时无法更新，保留上次加载的内容。 <button className="text-link" onClick={resource.reload}>重试</button></p>}
    {children}
  </div>;
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
