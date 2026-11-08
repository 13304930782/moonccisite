import { articleResourcePath, pendingArticle } from '../lib/articlePreload';
import { Info, CircleAlert, LoaderCircle } from 'lucide-react';
import { useI18n } from '../i18n';
import { useDocumentResource } from '../context/DocumentData';
import {useLocale} from '../context/LocaleContext';
import {localeResource} from '../lib/locale';
import { readSnapshot, writeSnapshot, snapshotGeneration, deleteSnapshot, subscribeSnapshotInvalidation } from '../lib/publicSnapshots';
import { notify } from '../lib/feedback';
import { FormEvent, ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {Link} from './LocaleLink';
import { api } from '../lib/api';
import { publicRead, publicReadPath } from '../lib/publicRead';
import { Header } from './Header';
import { SiteFooter } from './SiteFooter';
import { SiteBack } from './SiteBack';
import { visibleDiagnostic } from '../lib/browserDiagnostics';
import '../../styles/resource-state.css';

export function StatusNotice({children, state = 'info', action, className = ''}: {children: ReactNode; state?: 'info' | 'error' | 'loading'; action?: ReactNode; className?: string}) {
  return <div className={`status-notice ${className}`} data-state={state} role={state === 'error' ? 'alert' : 'status'} aria-busy={state === 'loading'}>
    {state === 'error' ? <CircleAlert aria-hidden="true" /> : state === 'loading' ? <LoaderCircle aria-hidden="true" /> : <Info aria-hidden="true" />}
    <div><p>{children}</p>{action}</div>
  </div>;
}

export type PageData<T = any> = { items: T[]; total: number; page: number; pageSize: number };
// Only published, user-independent endpoints may share an in-memory snapshot.

const cacheable = (path: string) => publicReadPath(path) || articleResourcePath(path);
export function useResource<T = any>(path: string, enabled = true) {
  const { t,locale } = useI18n();
  path = localeResource(path,useLocale().contentLocale);
  const initial = useDocumentResource(path, enabled);
  const snapshot = initial.data ?? (cacheable(path) ? readSnapshot(path) : null);
  const [state, setState] = useState<{ path: string; data: T | null }>({ path, data: snapshot }),
    [error, setError] = useState(initial.status ? t("m_9f738df452") : ''),
    [errorStatus,setErrorStatus]=useState<number|null>(initial.status || null),
    [loading, setLoading] = useState(!snapshot && !initial.status),
    [version, setVersion] = useState(0);
  const requestController = useRef<AbortController | null>(null);
  const cancel = useCallback(() => requestController.current?.abort(), []);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => subscribeSnapshotInvalidation(() => { if (cacheable(path)) { setState({path,data:null}); reload(); } }), [path, reload]);
  useEffect(() => {
    if (initial.data !== undefined && version === 0) return;
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
    const read = async () => {
      if (articleResourcePath(path)) {
        const cached = readSnapshot(path);
        if (cached) return cached;
        const prefetched = await pendingArticle(path);
        if (controller.signal.aborted) throw new Error('cancelled');
        if (prefetched) return prefetched;
      }
      return publicRead(path, controller.signal);
    };
    read()
      .then((v) => {
        if (active && (!cacheable(path) || generation === snapshotGeneration())) {
          setState({ path, data: v });
          if (cacheable(path) && (!articleResourcePath(path) || v?.status === 'published')) {
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
  const { t,locale } = useI18n();
  return <div className="content-skeleton" role="status" aria-label={t("m_aaca7d941e")} aria-busy="true">
    <span className="skeleton-line skeleton-heading" /><span className="skeleton-line" />
    <span className="skeleton-line" /><span className="skeleton-block" />
    <span className="sr-only">{t("m_2b1fde913d")}</span>
  </div>;
}
export function ResourceState({
  resource,
  children,
  loadingContent,
}: {
  resource: Omit<ReturnType<typeof useResource>,'errorStatus'|'cancel'> & {errorStatus?:number|null;cancel?:()=>void};
  children: ReactNode;
  loadingContent?: ReactNode;
}) {
  const { t,locale } = useI18n();
  const location=useLocation();
  useEffect(() => {
    if (!resource.loading && resource.data !== null) {
      const frame = requestAnimationFrame(() => { visibleDiagnostic(location.pathname, 'content-ready'); window.dispatchEvent(new Event('mooncci:content-ready')); });
      return () => cancelAnimationFrame(frame);
    }
  }, [resource.loading, resource.data, location.pathname]);
  const group=location.pathname.startsWith('/admin/')?'/admin':location.pathname.startsWith('/account/')?'/account/settings':location.pathname.startsWith('/projects/')?'/projects':location.pathname.startsWith('/updates/')?'/updates':location.pathname.startsWith('/series/')?'/series':'/articles';
  if (resource.loading && resource.data === null && loadingContent) return <>{loadingContent}</>;
  if (resource.loading && resource.data === null) return <div className="resource-loading"><div role="status" aria-label={t("m_aaca7d941e")}><span className="resource-loading-line" aria-hidden="true"/><span className="sr-only">{t("m_2b1fde913d")}</span></div>{resource.cancel && <button type="button" className="resource-cancel" onClick={resource.cancel}>{t("m_4740238092")}</button>}</div>;
  if (resource.error && resource.data === null)
    return (
      <div className="resource-notice" role="alert">
        <p>{t(resource.error || '')}</p>
        {resource.errorStatus===401?<Link className="quiet-button" to={'/login?redirect='+encodeURIComponent(location.pathname+location.search)}>{t("m_17ecf2c2e3")}</Link>:[403,404].includes(resource.errorStatus||0)?<Link className="quiet-button" to={group}>{t("m_572cf45ba4")}{group==='/admin'?t("m_f97de1b381"):group.startsWith('/account')?t("m_5a2cac68fd"):t("m_da82626e48")}</Link>:<button className="quiet-button" onClick={resource.reload}>{t("m_b8784c8dd5")}</button>}
      </div>
    );
  return <div className="resource-content" aria-busy={resource.loading}>
    {resource.error && <div className="resource-notice" role="status"><div><strong>{t("m_86b45a1c0f")}</strong><p>{t("m_d82945caac")}</p></div><button className="quiet-button" disabled={resource.loading} onClick={resource.reload}>{t("m_7bdd5ce1e2")}</button></div>}
    {resource.loading && resource.data !== null && <p className="sr-only" role="status">{t("m_1ae13f9104")}</p>}
    {children}
  </div>;
}
export function SitePage({ children, narrow = false, detail = false,className='',footerContent }: { children: ReactNode; narrow?: boolean; detail?: boolean;className?:string;footerContent?:ReactNode }) {
  const location=useLocation();
  const {locale}=useI18n();
  useLayoutEffect(() => { visibleDiagnostic(location.pathname, 'code-ready'); }, [location.key]);
  return (
    <div lang={locale} className={`neo-page ${className}`}>
      <Header />
      <main onAnimationEnd={event=>{if(event.target===event.currentTarget) visibleDiagnostic(location.pathname,'motion-complete');}} className={`site-container page-content ${narrow ? 'reading-page' : ''} ${detail ? 'detail-container' : ''}`}>
        {narrow ? <div className="page-reading-column">{children}</div> : children}
      </main>
      {footerContent}
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
      <SiteBack />
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}
export function formatDate(value: string | null, locale = 'zh-CN') {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value.slice(0, 10)
    : date.toLocaleDateString(locale, {
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
  const { t,locale , formatDate} = useI18n();
  return (
    <div className="activity-list">
      {!items.length && <p className="quiet-state">{t("m_722b9e62fa")}</p>}
      {items.map((item) => (
        <Link to={item.path} className="activity-row" key={item.activity_id}>
          <div className="activity-meta">
            <span>{t(labels[item.type])}</span>
            <time>{formatDate(item.published_at)}</time>
          </div>
          <div>
            <h3>{item.title}</h3>
            <p>{item.excerpt}</p>
            {item.type === 'release' && <small className="muted">{t("m_0a1ad2d284")}</small>}
          </div>
          <span className="activity-arrow" aria-hidden="true">↗</span>
        </Link>
      ))}
    </div>
  );
}
export function Pagination({ data, onPage }: { data: PageData; onPage: (page: number) => void }) {
  const { t,locale } = useI18n();
  const location = useLocation();
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  if (pages <= 1) return null;
  const link = (page: number) => { const params = new URLSearchParams(location.search); if(page===1)params.delete('page');else params.set('page',String(page)); return location.pathname + (params.size ? '?' + params : ''); };
  const control = (page: number, label: string, disabled: boolean) => disabled
    ? <span className="quiet-button" aria-disabled="true">{label}</span>
    : <Link className="quiet-button" to={link(page)} onClick={event=>{if(event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();onPage(page);}}}>{label}</Link>;
  return <nav className="pagination" aria-label={t("m_41299d9be8")}>
    {control(data.page-1,t("m_c9b9ae7a61"),data.page<=1)}
    <span aria-live="polite" aria-atomic="true">{data.page} / {pages}</span>
    {control(data.page+1,t("m_8a8542f696"),data.page>=pages)}
  </nav>;
}
export function SubscribeForm() {
  const { t,locale } = useI18n();
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
        body: JSON.stringify({ email,locale }),
      });
      notify.success(result.message);
      setMessage(result.message || t("m_700148ee4c"));
      setSubmitted(true);
    } catch (e: any) {
      setMessage(e.message); notify.error(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="subscribe-section" id="subscribe">
      <div className="subscribe-inner">
      <div className="subscribe-copy">
        <p className="eyebrow">KEEP IN TOUCH</p>
        <h2>{t("m_4eaa3e1390")}</h2>
        <p className="muted">{t("m_23c06fd368")}</p>
        <Link className="text-link" to="/rss">
           {t("m_005219f780")} </Link>
      </div>
      <div className={`subscribe-actions${!submitted && !status.data?.available ? " subscribe-feedback" : ""}`} >
        {submitted ? <div className="resource-notice" role="status"><div><strong>{t("m_ad74652984")}</strong><p>{t(message || '')}</p><p>{t("m_615b9f23a9")}</p></div><button type="button" className="quiet-button" onClick={() => { setSubmitted(false); setMessage(''); }}>{t("m_852471581c")}</button></div> : status.data?.available ? (
          <form onSubmit={submit}>
            <label htmlFor="subscribe-email">{t("m_2e412e0383")}</label>
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
              <button disabled={busy}>{busy ? t("m_26ef00b7d0") : t("m_80d5498052")}</button>
            </div>
            <small className="muted">{t("m_977837d429")}</small>
          </form>
        ) : (
          <StatusNotice className="subscribe-status" state={status.error ? 'error' : status.loading ? 'loading' : 'info'} action={status.error ? <button type="button" className="quiet-button" onClick={status.reload}>{t("m_bed6f56f48")}</button> : undefined}>
            {status.error ? t("m_9041a164ad") : status.loading ? t("m_63bfa64e1c") : t("m_82c092840e")}
          </StatusNotice>
        )}
        {!submitted && message && <p id="subscribe-message" role="alert" className="form-message">{t(message || '')}</p>}
      </div>
      </div>
    </section>
  );
}
