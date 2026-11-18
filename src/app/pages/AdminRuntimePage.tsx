import { ChevronDown, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AdminError, AdminLoading } from '../components/admin/AdminState';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import '../../styles/admin-runtime.css';

type Runtime = {
  checkedAt: string;
  api: { startedAt: string; node: string };
  worker: { state: string; startedAt: string | null; checkedAt: string | null };
  deployment: { revision: string | null; completedAt: string | null; result: string };
  migrations: { filename: string; executedAt: string }[] | null;
  disk: { freeBytes: number; totalBytes: number } | null;
};

export default function AdminRuntimePage() {
  const { t, formatDate } = useI18n();
  const [data, setData] = useState<Runtime | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);

  function time(value: string | null) {
    if (!value) return t('m_0c3abdcfbf');
    return <time dateTime={value}>{formatDate(value, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>;
  }

  function refresh() {
    if (loading) return;
    setLoading(true);
    setAttempt(previous => previous + 1);
  }

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    api('/admin/runtime', { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message || 'm_6aa27f14bf'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  const worker = data?.worker;
  const workerLabel = worker?.state === 'running' ? t('m_3ae4f98fce')
    : worker?.state === 'stopped' ? t('m_f006455e3b')
      : t('m_5ef203a496');
  const resultLabels: Record<string, string> = {
    success: t('m_053461ce86'),
    failed: t('m_28384d7afd'),
    'rolled-back': t('m_9d1ac300aa'),
  };
  const disk = data?.disk;
  const freeRatio = disk && disk.totalBytes > 0 ? Math.min(1, Math.max(0, disk.freeBytes / disk.totalBytes)) : null;
  const lowDisk = freeRatio !== null && freeRatio < 0.15;

  return (
    <div className="admin-page runtime-page">
      <header className="runtime-heading">
        <div>
          <h1 className="admin-title">{t('运行状态')}</h1>
          <p className="muted">{t('检查服务、部署、磁盘与数据库迁移记录。')}</p>
        </div>
        <div className="runtime-toolbar">
          <button type="button" className="quiet-button runtime-refresh" aria-disabled={loading} aria-busy={loading} onClick={refresh}>
            <RefreshCw size={16} aria-hidden="true" />
            {t('m_802a407c77')}
          </button>
          <p className="runtime-collected muted" role="status">
            {loading && <span className="sr-only">{t('m_86b6d0d630')}</span>}
            {data && (
              <span key={data.checkedAt}>{t('m_e6a568c300')} {time(data.checkedAt)}</span>
            )}
          </p>
        </div>
      </header>
      {loading && !data && <AdminLoading label="m_58c4f164e1" />}
      {!loading && error && <AdminError message={data ? t('m_e6e41af9be', { v0: t(error) }) : t(error)} onRetry={refresh} />}
      {data && (
        <>
          <div className="runtime-overview" aria-busy={loading}>
            <section className="runtime-section">
              <h2>API</h2>
              <dl className="runtime-data">
                <dt>{t('m_be4dc942f5')}</dt><dd>{time(data.api.startedAt)}</dd>
                <dt>Node.js</dt><dd>{data.api.node}</dd>
              </dl>
            </section>
            <section className="runtime-section">
              <div className="runtime-section-heading">
                <h2>{t('m_6d76b74983')}</h2>
                <span className="admin-status-chip runtime-status" data-tone={data.worker.state}>{workerLabel}</span>
              </div>
              <dl className="runtime-data">
                <dt>{t('m_be4dc942f5')}</dt><dd>{time(data.worker.startedAt)}</dd>
                <dt>{t('m_68aa217d3d')}</dt><dd>{time(data.worker.checkedAt)}</dd>
              </dl>
              <p className="runtime-caption muted">{t('m_0c240b7cfc')}</p>
            </section>
            <section className="runtime-section">
              <div className="runtime-section-heading">
                <h2>{t('m_089ea9f613')}</h2>
                <span className="admin-status-chip runtime-status" data-tone={data.deployment.result}>
                  {resultLabels[data.deployment.result] || t('m_4d8c1c5b42')}
                </span>
              </div>
              <dl className="runtime-data">
                <dt>{t('m_9a1ac4d445')}</dt><dd>{data.deployment.revision ? <code>{data.deployment.revision}</code> : t('m_a8aa59d54d')}</dd>
                <dt>{t('部署时间')}</dt><dd>{time(data.deployment.completedAt)}</dd>
              </dl>
            </section>
            <section className="runtime-section">
              <h2>{t('m_231d1cdd68')}</h2>
              <p className="runtime-disk-value">{disk
                ? t('m_26f65967e8', { v0: (disk.freeBytes / 1073741824).toFixed(1), v1: (disk.totalBytes / 1073741824).toFixed(1) })
                : t('m_c270415855')}</p>
              {freeRatio !== null && <div className="runtime-disk-track" data-low={lowDisk} aria-hidden="true">
                <span style={{ transform: `scaleX(${freeRatio})` }} />
              </div>}
              {lowDisk && <p className="runtime-warning" role="alert">{t('m_2ff54f03f9')}</p>}
            </section>
          </div>
          {data.migrations?.length ? (
            <details className="runtime-migrations">
              <summary>
                <h2>{t('m_4f318ac482')}</h2>
                <span className="runtime-migration-count muted">{data.migrations.length}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <ul className="runtime-migration-list">
                {data.migrations.map(row => (
                  <li key={row.filename}><code>{row.filename}</code><span className="muted">{time(row.executedAt)}</span></li>
                ))}
              </ul>
            </details>
          ) : (
            <section className="runtime-migrations runtime-migrations-empty">
              <h2>{t('m_4f318ac482')}</h2>
              <p className="muted">{data.migrations === null ? t('m_1d3ed415eb') : t('m_46ca86da52')}</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
