import { useI18n } from '../i18n';
import { notify } from '../lib/feedback';
import { useEffect, useState } from 'react';
import { useUnsavedLeave } from '../lib/useUnsavedLeave';
import { AdminEmpty, AdminError, AdminLoading } from '../components/admin/AdminState';
import { Copy, Check } from 'lucide-react';
import '../../styles/login-settings.css';
import { api } from '../lib/api';

type Provider = { provider: string; name: string; enabled: boolean; ready: boolean; client_id: string; has_secret: boolean; version: number; source: string; callback_url: string; origin: string; client_secret?: string; clear_secret?: boolean };
const inputClass = 'w-full rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring';
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
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const data = await api(`/auth/providers/manage/${form.provider}`, { method: 'PUT', body: JSON.stringify({ enabled: form.enabled, client_id: form.client_id.trim(), client_secret: form.client_secret || '', clear_secret: form.clear_secret || false, version: form.version }) });
      setForm(data.provider); onSaved(data.provider); notify.success(data.message);
    } catch (error: any) { setMessage(error.message || t("m_6309a3bb5b")); }
    finally { setSaving(false); }
  };
  return <form id={`provider-${initial.provider}`} hidden={hidden} onSubmit={save} className="provider-settings-card">
    <fieldset disabled={saving} className="provider-settings-fields">
      <div className="provider-settings-heading"><h2>{form.name}</h2><span className="provider-status">{initial.ready ? t("m_dfb802238b") : initial.client_id ? t("m_f16ab7c314") : t("m_d64a0b1f26")}</span></div>
      <label className="provider-toggle"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />{t("m_f4f0ead111")} {form.name}  {t("m_1e2df9c307")}</label>
      {form.provider==='microsoft'&&<p className="text-sm text-muted-foreground">{t("m_ba3f56852f")}</p>}
      {google && <p className="text-sm text-muted-foreground">{t("m_0b0a180872")}</p>}
      <label className="provider-field"><span className="mb-2 block">{google || ['github', 'gitee', 'microsoft'].includes(form.provider) ? 'Client ID' : 'AppID'}</span><input className={inputClass} value={form.client_id} autoComplete="off" spellCheck={false} maxLength={255} onChange={e => setForm({ ...form, client_id: e.target.value })} /></label>
      {!google && <>
        <label className="provider-field"><span className="mb-2 block">{form.provider === 'qq' ? 'AppKey' : form.provider === 'wechat' ? 'AppSecret' : 'Client Secret'}</span><input className={inputClass} type="password" autoComplete="new-password" value={form.client_secret || ''} maxLength={2048} onChange={e => setForm({ ...form, client_secret: e.target.value, clear_secret: false })} /><small>{form.has_secret ? t("m_6dd117ddb5") : t("m_bd7cfca1c2")}</small></label>
        {form.has_secret && <label className="provider-toggle"><input type="checkbox" checked={form.clear_secret || false} onChange={e => setForm({ ...form, clear_secret: e.target.checked, client_secret: '', enabled: e.target.checked ? false : form.enabled })} />{t("m_817d6acf68")}</label>}
      </>}
      <div className="provider-callback"><p className="mb-2 text-muted-foreground">{google ? t("m_40bf9a5768") : t("m_9ca160d659")}</p><div className="provider-callback-row"><code className="break-all select-all">{form.callback_url}</code><button type="button" className="provider-copy" onClick={()=>void copyCallback()}>{copied?<Check size={16} aria-hidden="true"/>:<Copy size={16} aria-hidden="true"/>}<span aria-live="polite">{t(copied?'已复制':'复制')}</span></button></div>{copyError&&<p role="alert">{t('复制失败，请手动复制')}</p>}
        {form.provider === 'wechat' && <p className="mt-3">{t("m_470596ed12")}<code className="select-all">{new URL(form.origin).hostname}</code>{t("m_4ae5f1d6cd")}</p>}
      </div>
      <p className="provider-hint">{t("m_0e520a1cef")}</p>
      {message && <p role="alert" className="text-sm text-destructive">{t(message || '')}</p>}
      <div className="provider-save-actions"><button className="neo-button neo-button-dark" type="submit" disabled={!dirty}>{saving ? t("m_ff509c9ba0") : t("m_bc7fdeafee", {v0: form.name})}</button><button type="button" className="neo-button" disabled={!dirty} onClick={() => { setForm(initial); setMessage(''); }}>{t("m_ef804eda90")}</button><span role="status" className="text-sm text-muted-foreground">{dirty ? t("m_6265f9d3f3") : t("m_1bd91a7d0c")}</span></div>
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
  return <div className="admin-page login-settings-page">
    <h1 className="admin-title">{t("m_e37441c86c")}</h1>
    <p className="provider-page-description">{t("m_ffb2c933f9")}</p>
    {loading ? <AdminLoading label={t("m_b3b972dd79")} /> : error ? <AdminError message={t(error || '')} onRetry={() => setAttempt(x => x + 1)} /> : !providers.length ? <AdminEmpty title={t("m_c1091e0c72")} /> :
      <><nav className="provider-navigation" aria-label={t("m_e37441c86c")}>{providers.map(p => <button key={p.provider} type="button" aria-controls={`provider-${p.provider}`} aria-pressed={activeProvider === p.provider} onClick={() => setSelectedProvider(p.provider)}>{p.name}</button>)}</nav><div>{providers.map(p => <ProviderForm key={`${attempt}-${p.provider}`} hidden={activeProvider !== p.provider} initial={p} onSaved={value => setProviders(items => items.map(item => item.provider === value.provider ? value : item))} />)}</div></>}
  </div>;
}
