import { ArrowUpRight, Users } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AdminError, AdminLoading, AdminNotice } from '../components/admin/AdminState';
import { Link } from '../components/LocaleLink';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { useUnsavedLeave } from '../lib/useUnsavedLeave';
import '../../styles/node-monitor.css';
import '../../styles/admin-node-settings.css';

type Connection = { configured: boolean; origin?: string };

export default function AdminNodeMonitorPage() {
  const { t } = useI18n();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    setLoadError('');
    api('/node-monitor/settings').then(value => {
      if (active) setConnection(value);
    }).catch(error => {
      if (active) setLoadError(error.message || t('m_38b8756a83'));
    });
    return () => { active = false; };
  }, [attempt]);
  useUnsavedLeave(Boolean(key));

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!connection || !key || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setSaveError('');
    setMessage('');
    try {
      await api('/node-monitor/settings', { method: 'PUT', body: JSON.stringify({ apiKey: key }) });
      setKey('');
      setConnection({ ...connection, configured: true });
      setMessage(t('m_6acff2ee4e'));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('m_cf1487e7aa'));
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  const configured = connection?.configured;
  const status = saving ? t('m_664ada2ce4') : key ? t('m_6265f9d3f3') : message;

  return <div className="node-page node-settings">
    <header className="node-settings-heading">
      <div><h1 className="admin-title">{t('m_62132614a1')}</h1><p>{t('m_04c1b29460')}</p></div>
      <Link className="node-button" to="/node-monitor">{t('m_2e9f2327bd')}<ArrowUpRight size={16} aria-hidden="true" /></Link>
    </header>
    {loadError ? <AdminError message={loadError} onRetry={() => setAttempt(value => value + 1)} /> :
      !connection ? <AdminLoading label="m_69ede7ee41" /> : <>
        <section className="node-panel node-settings-connection" aria-labelledby="node-connection">
          <div className="node-section-heading">
            <div><h2 id="node-connection">{t('m_bab659d652')}</h2><p>{t('m_74a63d9ef8')}</p></div>
            <span className="admin-status-chip node-connection-state" data-configured={configured}>{configured ? t('m_de8184da1e') : t('m_80a57e03f0')}</span>
          </div>
          <form onSubmit={save}>
            <div className="node-fields">
              <dl>
                <dt className="node-label">{t('m_02739d1bae')}</dt>
                <dd className="node-origin">{connection.origin || 'https://komari.mooncci.site:9443'}</dd>
              </dl>
              <label htmlFor="monitor-key">{t('m_5f600b307b')}
                <input id="monitor-key" type="password" autoComplete="new-password" disabled={saving} value={key}
                  onChange={event => { setKey(event.target.value); setMessage(''); setSaveError(''); }}
                  placeholder={configured ? t('m_df8eea2ca5') : t('m_5d8bbcdfc4')} aria-describedby="monitor-key-help" />
                <small id="monitor-key-help">{t('m_1f264353b2')}</small>
              </label>
            </div>
            <div className="node-save">
              <p role="status">{status && <span key={status}>{status}</span>}</p>
              <div className="node-save-actions">
                <button type="button" className="node-button" disabled={saving || !key}
                  onClick={() => { setKey(''); setSaveError(''); setMessage(''); }}>{t('m_ef804eda90')}</button>
                <button type="submit" className="node-button node-primary" aria-busy={saving} disabled={saving || !key}>{t('m_f5dede740e')}</button>
              </div>
            </div>
            {saveError && <AdminNotice>{t(saveError)}</AdminNotice>}
          </form>
        </section>
        <section className="node-panel node-permission-link" aria-labelledby="node-permissions">
          <div><h2 id="node-permissions">{t('m_1ab7161933')}</h2><p>{t('m_49dc850ca2')}</p></div>
          <Link className="node-button" to="/admin/users"><Users size={16} aria-hidden="true" />{t('m_e09366144c')}<ArrowUpRight size={16} aria-hidden="true" /></Link>
        </section>
      </>}
  </div>;
}
