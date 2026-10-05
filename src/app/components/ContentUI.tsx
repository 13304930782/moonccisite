import { readSnapshot, writeSnapshot, snapshotGeneration, deleteSnapshot, subscribeSnapshotInvalidation } from '../lib/publicSnapshots';
import { notify } from '../lib/feedback';
import { FormEvent, ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { publicRead, publicReadPath } from '../lib/publicRead';
import { Header } from './Header';
import { SiteFooter } from './SiteFooter';
import { visibleDiagnostic } from '../lib/browserDiagnostics';

export type PageData<T = any> = { items: T[]; total: number; page: number; pageSize: number };
// Only published, user-independent endpoints may share an in-memory snapshot.

const cacheable = publicReadPath;
export function useResource<T = any>(path: string, enabled = true) {
  const snapshot = cacheable(path) ? readSnapshot(path) : null;
  const [state, setState] = useState<{ path: string; data: T | null }>({ path, data: snapshot }),
    [error, setError] = useState(''),
    [errorStatus,setErrorStatus]=useState<number|null>(null),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const requestController = useRef<AbortController | null>(null);
  const cancel = useCallback(() => requestController.current?.abort(), []);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => subscribeSnapshotInvalidation(() => { if (cacheable(path)) { setState({path,data:null}); reload(); } }), [path, reload]);
  useEffect(() => {
    const generation = snapshotGeneration();
    if (!enabled) {
      requestController.current?.abort();
      setState({ path, data: null });
      setError('');setErrorStatus(null);
      setLoading(true);
      return;
    }
    let active = true;
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    setError('');setErrorStatus(null);
    setState(current => current.path === path ? current : { path, data: snapshot });
    publicRead(path, controller.signal)
      .then((v) => {
        if (active && (!cacheable(path) || generation === snapshotGeneration())) {
          setState({ path, data: v });
          if (cacheable(path)) {
            writeSnapshot(path, v, generation);
          }
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);setErrorStatus(e.status||null);
          if ([401, 403, 404].includes(e.status)) {
            deleteSnapshot(path);
            setState({ path, data: null });
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false; controller.abort();
    };
  }, [path, version, enabled]);
  return { cancel, errorStatus:enabled&&state.path===path?errorStatus:null, data: enabled ? (state.path === path ? state.data : snapshot) : null, error: enabled&&state.path===path ? error : '', loading: loading || state.path !== path, reload };
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
  resource: Omit<ReturnType<typeof useResource>,'errorStatus'|'cancel'> & {errorStatus?:number|null;cancel?:()=>void};
  children: ReactNode;
}) {
  const location=useLocation();
  useEffect(() => {
    if (!resource.loading && resource.data !== null) {
      const frame = requestAnimationFrame(() => { visibleDiagnostic(location.pathname, 'content-ready'); window.dispatchEvent(new Event('mooncci:content-ready')); });
      return () => cancelAnimationFrame(frame);
    }
  }, [resource.loading, resource.data, location.pathname]);
  const group=location.pathname.startsWith('/admin/')?'/admin':location.pathname.startsWith('/account/')?'/account/settings':location.pathname.startsWith('/projects/')?'/projects':location.pathname.startsWith('/updates/')?'/updates':location.pathname.startsWith('/series/')?'/series':'/articles';
  if (resource.loading && resource.data === null) return <div><ContentSkeleton />{resource.cancel && <button className="quiet-button" onClick={resource.cancel}>取消加载</button>}</div>;
  if (resource.error && resource.data === null)
    return (
      <div className="resource-notice" role="alert">
        <p>{resource.error}</p>
        {resource.errorStatus===401?<Link className="quiet-button" to={'/login?redirect='+encodeURIComponent(location.pathname+location.search)}>重新登录后继续</Link>:[403,404].includes(resource.errorStatus||0)?<Link className="quiet-button" to={group}>返回{group==='/admin'?'后台':group.startsWith('/account')?'个人中心':'内容列表'}</Link>:<button className="quiet-button" onClick={resource.reload}>重试</button>}
      </div>
    );
  return <div className="resource-content" aria-busy={resource.loading}>
    {resource.error && <div className="resource-notice" role="status"><div><strong>暂时无法更新</strong><p>保留上次加载的内容，你可以稍后重试。</p></div><button className="quiet-button" disabled={resource.loading} onClick={resource.reload}>重新加载</button></div>}
    {resource.loading && resource.data !== null && <p className="muted" role="status">正在刷新，当前内容仍可查看。</p>}
    {children}
  </div>;
}
export function SitePage({ children, narrow = false, detail = false }: { children: ReactNode; narrow?: boolean; detail?: boolean }) {
  const location=useLocation();
  useLayoutEffect(() => { visibleDiagnostic(location.pathname, 'code-ready'); }, [location.key]);
  return (
    <div className="neo-page">
      <Header />
      <main onAnimationEnd={event=>{if(event.target===event.currentTarget) visibleDiagnostic(location.pathname,'motion-complete');}} className={`site-container page-content ${narrow ? 'reading-page' : ''} ${detail ? 'detail-container' : ''}`}>
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
          <span className="activity-arrow" aria-hidden="true">↗</span>
        </Link>
      ))}
    </div>
  );
}
export function Pagination({ data, onPage }: { data: PageData; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="分页">
      <button className="quiet-button" disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>
        上一页
      </button>
      <span aria-live="polite" aria-atomic="true">
        {data.page} / {pages}
      </span>
      <button className="quiet-button" disabled={data.page >= pages} onClick={() => onPage(data.page + 1)}>
        下一页
      </button>
    </nav>
  );
}
export function SubscribeForm() {
  const [email, setEmail] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const status = useResource('/subscriptions/status');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    setSubmitted(false);
    try {
      const result = await api('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      notify.success(result.message);
      setMessage(result.message || '请查收订阅确认邮件，点击邮件中的链接完成订阅。');
      setSubmitted(true);
    } catch (e: any) {
      setMessage(e.message); notify.error(e.message);
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
        {submitted ? <div className="resource-notice" role="status"><div><strong>订阅申请已提交</strong><p>{message}</p><p>确认邮件中的链接后，订阅才会生效。</p></div><button type="button" className="quiet-button" onClick={() => { setSubmitted(false); setMessage(''); }}>修改邮箱或重新申请</button></div> : status.data?.available ? (
          <form onSubmit={submit}>
            <label htmlFor="subscribe-email">邮箱地址</label>
            <div className="subscribe-form">
              <input
                id="subscribe-email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                aria-describedby={message ? 'subscribe-message' : undefined}
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
        {status.error && !submitted && <button type="button" className="quiet-button" onClick={status.reload}>重新检查订阅状态</button>}
        {!submitted && message && <p id="subscribe-message" role="alert" className="form-message">{message}</p>}
      </div>
    </section>
  );
}
