import { ChevronDown, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { notify } from '../lib/feedback';
import { AdminError, AdminLoading, AdminNotice } from './admin/AdminState';
import { Link } from './LocaleLink';
import '../../styles/admin-seo.css';

type Action = 'check' | 'submit' | 'retry';
type Article = {
  id: number;
  title: string;
  url: string;
  stale: boolean;
  report?: {
    state: 'passed' | 'warning' | 'failed';
    checkedAt: string;
    issues: { code: string; message: string }[];
  } | null;
};

type IndexNow = {
  state: 'available' | 'stale' | 'unavailable' | 'invalid';
  checkedAt?: string;
  pendingCount?: number;
  message?: string;
  lastRun?: { ok: boolean; error?: string };
  blocked?: string | { reason?: string };
  nextRetryAt?: string;
  pendingUrls?: (string | { url: string })[];
  receipts?: { at?: string; http?: number; endpoint?: string; reason?: string; urls?: string[] }[];
  requests?: { requestedAt?: string; state: string; url: string; reason?: string }[];
};

type Result = { total: number; items: Article[]; indexNow: IndexNow };

const indexLabels = {
  available: 'm_887e6a8f47',
  stale: 'm_f62dae4ea6',
  unavailable: 'm_93ae902da0',
  invalid: 'm_34c01d4e47',
};

const reportLabels = {
  stale: 'm_58d2744020',
  passed: 'm_b5aeebc281',
  warning: 'm_e3cbcb40c9',
  failed: 'm_7628d291c5',
  unchecked: 'm_cdbc0434f5',
};

const time = (value: string | undefined, locale: string) =>
  value ? new Date(value).toLocaleString(locale, { timeZone: 'Asia/Shanghai' }) : '';

function IndexNowStatus({ status }: { status: IndexNow }) {
  const { locale, t } = useI18n();
  const receipts = status.receipts ?? [];
  const requests = status.requests ?? [];
  return <section className="seo-status" aria-labelledby="seo-indexnow">
    <div className="seo-status-main">
      <div>
        <div className="seo-status-title">
          <h2 id="seo-indexnow">IndexNow</h2>
          <span className="seo-status-chip" data-state={status.state}>{t(indexLabels[status.state])}</span>
        </div>
        <p className="seo-secondary">{t('更新时间')} <time dateTime={status.checkedAt}>{time(status.checkedAt, locale) || t('m_0c3abdcfbf')}</time></p>
      </div>
      {status.state === 'available' && <dl className="seo-pending">
        <dt>{t('m_999a459c3f')}</dt><dd>{status.pendingCount ?? t('m_4d8c1c5b42')}</dd>
      </dl>}
    </div>
    {status.message && <p className="seo-secondary">{t(status.message)}</p>}
    {(status.lastRun?.ok === false || status.blocked || status.nextRetryAt) && <div className="seo-status-notices">
      {status.lastRun?.ok === false && <AdminNotice>{t('m_49d711736d')}{status.lastRun.error || t('m_fa74c18d17')}</AdminNotice>}
      {status.blocked && <AdminNotice>{t('m_1d14080c50')}{typeof status.blocked === 'string' ? status.blocked : status.blocked.reason || t('m_e55bcdabbc')} {t('m_cb38a21807')}</AdminNotice>}
      {status.nextRetryAt && <p className="seo-secondary">{t('m_b272bd617c')} <time dateTime={status.nextRetryAt}>{time(status.nextRetryAt, locale)}</time></p>}
    </div>}
    <div className="seo-records">
      <details className="seo-details">
        <summary><span>{t('最近提交记录')}</span><span className="seo-record-count">{receipts.length}</span><ChevronDown size={16} aria-hidden="true" /></summary>
        <div className="seo-record-body" tabIndex={0} aria-label={t('最近提交记录')} role="region">{receipts.length ? receipts.slice().reverse().map((receipt, index) => <div className="seo-record" key={index}>
          <div className="seo-record-heading">
            <strong>{receipt.http == null ? t('m_51fa398c2d') : 'HTTP ' + receipt.http}</strong>
            <time dateTime={receipt.at}>{time(receipt.at, locale) || t('m_0c3abdcfbf')}</time>
          </div>
          <p>{receipt.http === 200 ? t('m_5b41038443') : receipt.http === 202 ? t('m_e16518c183') : t('m_127ef8609b')}</p>
          {receipt.endpoint && <p>{receipt.endpoint}</p>}
          {receipt.reason && <p>{receipt.reason}</p>}
          {!!receipt.urls?.length && <ul>{receipt.urls.map(url => <li key={url}>{url}</li>)}</ul>}
        </div>) : <p className="seo-record-empty">{t('m_c73d185a37')}</p>}</div>
      </details>
      <details className="seo-details">
        <summary><span>{t('m_3f303c544c')}</span><span className="seo-record-count">{requests.length}</span><ChevronDown size={16} aria-hidden="true" /></summary>
        <div className="seo-record-body" tabIndex={0} aria-label={t('m_3f303c544c')} role="region">
          <p className="seo-record-hint">{t('m_51e436acd0')}</p>
          {requests.length ? requests.slice().reverse().map((request, index) => <div className="seo-record" key={index}>
            <div className="seo-record-heading">
              <strong>{request.state === 'queued' ? t('m_1a185b772b') : request.state === 'rejected' ? t('m_3d6b936393') : request.state}</strong>
              <time dateTime={request.requestedAt}>{time(request.requestedAt, locale) || t('m_0c3abdcfbf')}</time>
            </div>
            <p>{request.url}</p>
            {request.reason && <p>{request.reason}</p>}
          </div>) : <p className="seo-record-empty">{t('m_aaf6a280fa')}</p>}
        </div>
      </details>
    </div>
  </section>;
}

export function PublicationHealth() {
  const { locale, t } = useI18n();
  const [data, setData] = useState<Result | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError('');
    try {
      const value = await api('/admin/publication-health?page=' + page, { signal });
      if (!signal?.aborted) setData(value);
    } catch (error: any) {
      if (!signal?.aborted) setError(error.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [page]);

  async function act(id: number, action: Action) {
    setBusy(id + action);
    setError('');
    try {
      const result = await api('/admin/publication-health/' + id + '/' + action, { method: 'POST', body: '{}' });
      notify.success(t(result.message || 'm_1b2b881898'));
      await load();
    } catch (error: any) {
      notify.error(t(error.message), { shake: true });
    } finally {
      setBusy('');
    }
  }

  const status = data?.indexNow;
  const unavailable = status?.state !== 'available';

  return <section className="seo-page" aria-labelledby="publication-health-title">
    <header className="seo-page-heading">
      <div><h1 id="publication-health-title">{t('SEO 与索引')}</h1><p>{t('m_32558a39da')}</p></div>
      <button type="button" className="seo-button" disabled={loading || !!busy} onClick={() => void load()}>
        <RefreshCw size={16} aria-hidden="true" className={loading ? 'seo-refreshing' : undefined} />{t('m_802a407c77')}
      </button>
    </header>
    {loading && !data && <AdminLoading label="m_4ad4d63474" />}
    {error && <AdminError message={error} onRetry={() => void load()} />}
    {status && <IndexNowStatus status={status} />}
    {data && <section className="seo-articles" aria-labelledby="seo-articles-title" aria-busy={loading}>
      <div className="seo-section-heading">
        <h2 id="seo-articles-title">{t('m_63b3efed25')}</h2><span>{data.total} {t('m_4e7b9204a9')}</span>
      </div>
      {data.items.length ? <div className="seo-article-list">{data.items.map(article => {
        const { id, title, url, report, stale } = article;
        const state = stale ? 'stale' : report?.state || 'unchecked';
        const issues = report?.issues ?? [];
        const queued = status?.pendingUrls?.some(pending => (typeof pending === 'string' ? pending : pending.url) === url);
        return <article className="seo-article" key={id}>
          <div className="seo-article-copy">
            <Link className="seo-article-title" to={new URL(url).pathname}>{title}</Link>
            <div className="seo-article-status">
              <span className="seo-status-chip" data-state={state}>{t(reportLabels[state])}</span>
              {report && <time dateTime={report.checkedAt}>{time(report.checkedAt, locale) || t('m_0c3abdcfbf')}</time>}
            </div>
            {issues.length > 0 && <details className="seo-details seo-findings">
              <summary><span>{t('检查问题（{count}）', { count: issues.length })}</span><ChevronDown size={16} aria-hidden="true" /></summary>
              <ul className="seo-issues">{issues.map(issue => <li key={issue.code}>{t(issue.message)}</li>)}</ul>
            </details>}
          </div>
          <div className="seo-actions">
            <button type="button" className="seo-button" disabled={loading || !!busy} onClick={() => void act(id, 'check')}>
              {busy === id + 'check' ? t('m_6b72c3d685') : t('m_a0722bd6b2')}
            </button>
            <button type="button" className="seo-button seo-button-primary" disabled={loading || !!busy || unavailable} onClick={() => void act(id, 'submit')}>
              {t('m_a6a8bbba9d')}
            </button>
            {queued && <button type="button" className="seo-button seo-button-retry" disabled={loading || !!busy || unavailable} onClick={() => void act(id, 'retry')}>
              {t('m_8e86420324')}
            </button>}
          </div>
        </article>;
      })}</div> : <p className="seo-empty">{t('m_ee55a700d8')}</p>}
      {data.total > 20 && <div className="seo-pagination">
        <button type="button" className="seo-button" disabled={page <= 1 || loading || !!busy} onClick={() => setPage(previous => previous - 1)}>{t('m_c9b9ae7a61')}</button>
        <span aria-live="polite">{t('m_af50a0fe2a')} {page} {t('m_edf75360e0')} {data.total} {t('m_4e7b9204a9')}</span>
        <button type="button" className="seo-button" disabled={page * 20 >= data.total || loading || !!busy} onClick={() => setPage(previous => previous + 1)}>{t('m_8a8542f696')}</button>
      </div>}
    </section>}
  </section>;
}
