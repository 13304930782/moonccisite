import { useI18n } from '../i18n';
import { notify } from '../lib/feedback';
import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useUnsavedLeave } from '../lib/useUnsavedLeave';
import { AdminEmpty, AdminError, AdminLoading, AdminNotice } from '../components/admin/AdminState';
import { ThemeSelect } from '../components/ThemeSelect';
import { Check, ChevronDown, Copy } from 'lucide-react';
import '../../styles/admin-service-settings.css';
import '../../styles/login-settings.css';
import { api } from '../lib/api';

type Provider = { provider: string; name: string; enabled: boolean; ready: boolean; client_id: string; has_secret: boolean; version: number; source: string; callback_url: string; origin: string; client_secret?: string; clear_secret?: boolean };
function ProviderForm({ initial, onSaved, hidden }: { initial: Provider; onSaved: (value: Provider) => void; hidden: boolean }) {
  const { t } = useI18n();
  const [form, setForm] = useState(initial);
  const [copied,setCopied]=useState(false);
  const [copyError,setCopyError]=useState(false);
  async function copyCallback(){try{await navigator.clipboard.writeText(form.callback_url);setCopied(true);setCopyError(false);}catch{setCopied(false);setCopyError(true);}}
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const dirty = form.enabled !== initial.enabled || form.client_id !== initial.client_id || Boolean(form.client_secret) || Boolean(form.clear_secret);
  useUnsavedLeave(dirty);
  const google = form.provider === 'google';
  const name = t(form.name);
  const state = saving ? 'saving' : dirty ? 'dirty' : 'saved';
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!dirty || saving) return;
    setSaving(true); setMessage('');
    try {
      const data = await api(`/auth/providers/manage/${form.provider}`, { method: 'PUT', body: JSON.stringify({ enabled: form.enabled, client_id: form.client_id.trim(), client_secret: form.client_secret || '', clear_secret: form.clear_secret || false, version: form.version }) });
      setForm(data.provider); onSaved(data.provider); notify.success(data.message);
    } catch (error: any) { setMessage(error.message || t("m_6309a3bb5b")); }
    finally { setSaving(false); }
  };
  return <form id={`provider-${initial.provider}`} hidden={hidden} onSubmit={save} className="provider-settings-card service-settings-card">
    <fieldset disabled={saving} className="provider-settings-fields">
      <div className="provider-settings-heading">
        <div className="provider-identity">
          <h2>{name}</h2>
          <span className="provider-status admin-status-chip" data-status={initial.ready ? 'approved' : undefined}>{initial.ready ? t("m_dfb802238b") : initial.client_id ? t("m_f16ab7c314") : t("m_d64a0b1f26")}</span>
        </div>
        <label className="provider-toggle service-settings-toggle"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />{t('启用 {provider} 登录', {provider:name})}</label>
      </div>
      <div className="provider-credentials service-settings-grid">
        <label className="provider-field service-settings-field">
          <span>{google || ['github', 'gitee', 'microsoft'].includes(form.provider) ? 'Client ID' : 'AppID'}</span>
          <input value={form.client_id} autoComplete="off" spellCheck={false} maxLength={255} onChange={e => setForm({ ...form, client_id: e.target.value })} />
        </label>
        {!google && <label className="provider-field service-settings-field">
          <span>{form.provider === 'qq' ? 'AppKey' : form.provider === 'wechat' ? 'AppSecret' : 'Client Secret'}</span>
          <input type="password" autoComplete="new-password" value={form.client_secret || ''} maxLength={2048} onChange={e => setForm({ ...form, client_secret: e.target.value, clear_secret: false })} />
          <small>{form.has_secret ? t("m_6dd117ddb5") : t("m_bd7cfca1c2")}</small>
        </label>}
      </div>
      {!google && form.has_secret && <label className="provider-toggle service-settings-toggle"><input type="checkbox" checked={form.clear_secret || false} onChange={e => setForm({ ...form, clear_secret: e.target.checked, client_secret: '', enabled: e.target.checked ? false : form.enabled })} />{t("m_817d6acf68")}</label>}
      <div className="provider-callback">
        <p>{google ? t("m_40bf9a5768") : t("m_9ca160d659")}</p>
        <div className="provider-callback-row">
          <code className="select-all">{form.callback_url}</code>
          <button type="button" className="neo-button provider-copy" onClick={()=>void copyCallback()}>{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}<span aria-live="polite">{t(copied ? '已复制' : '复制')}</span></button>
        </div>
        {copyError && <p role="alert">{t('复制失败，请手动复制')}</p>}
        {form.provider === 'wechat' && <p className="provider-callback-domain">{t("m_470596ed12")}<code className="select-all">{new URL(form.origin).hostname}</code>{t("m_4ae5f1d6cd")}</p>}
      </div>
      <details className="service-settings-details" open={!initial.client_id || undefined}>
        <summary>{t('配置说明')}<ChevronDown size={16} aria-hidden="true" /></summary>
        <div className="service-settings-detail-content">
          {form.provider === 'microsoft' && <p>{t("m_ba3f56852f")}</p>}
          {google && <p>{t("m_0b0a180872")}</p>}
          <p>{t("m_ffb2c933f9")}</p>
          <p>{t("m_0e520a1cef")}</p>
        </div>
      </details>
      <div className="provider-save-actions service-settings-actions">
        <span role="status" data-state={state}>{t(saving ? "m_ff509c9ba0" : dirty ? "m_6265f9d3f3" : "m_1bd91a7d0c")}</span>
        <button type="button" className="neo-button" disabled={!dirty} onClick={() => { setForm(initial); setMessage(''); }}>{t("m_ef804eda90")}</button>
        <button className="neo-button neo-button-dark" type="submit" disabled={!dirty}>{t("m_bc7fdeafee", {v0:name})}</button>
      </div>
      {message && <AdminNotice>{t(message)}</AdminNotice>}
    </fieldset>
  </form>;
}
export default function AdminLoginSettingsPage() {
  const { t } = useI18n();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState('');
  const activeProvider = providers.some(p => p.provider === selectedProvider) ? selectedProvider : providers[0]?.provider;
  useEffect(() => {
    let active = true; setError(''); setLoading(true);
    api('/auth/providers/manage').then(data => { if (active) setProviders(data.providers); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  const activeIndex = Math.max(0, providers.findIndex(provider => provider.provider === activeProvider));
  return <div className="admin-page login-settings-page service-settings">
    <header className="service-settings-heading">
      <h1 className="admin-title">{t("m_e37441c86c")}</h1>
      <p>{t('配置第三方登录所需的应用凭据与回调地址。')}</p>
    </header>
    {loading ? <AdminLoading label={t("m_b3b972dd79")} /> : error ? <AdminError message={t(error || '')} onRetry={() => setAttempt(x => x + 1)} /> : !providers.length ? <AdminEmpty title={t("m_c1091e0c72")} /> :
      <>
        {providers.length > 1 && <>
          <nav className="provider-navigation" aria-label={t("m_e37441c86c")} style={{'--provider-count':providers.length, '--provider-index':activeIndex} as CSSProperties}>
            {providers.map(p => <button key={p.provider} type="button" aria-controls={`provider-${p.provider}`} aria-pressed={activeProvider === p.provider} onClick={() => setSelectedProvider(p.provider)}>{t(p.name)}</button>)}
          </nav>
          <ThemeSelect className="provider-picker" aria-label={t("m_e37441c86c")} compact value={activeProvider ?? ''} onValueChange={setSelectedProvider}>
            {providers.map(p => <option key={p.provider} value={p.provider}>{t(p.name)}</option>)}
          </ThemeSelect>
        </>}
        {providers.map(p => <ProviderForm key={`${attempt}-${p.provider}`} hidden={activeProvider !== p.provider} initial={p} onSaved={value => setProviders(items => items.map(item => item.provider === value.provider ? value : item))} />)}
      </>}
  </div>;
}
