import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Provider = { provider: string; name: string; enabled: boolean; ready: boolean; client_id: string; has_secret: boolean; version: number; source: string; callback_url: string; origin: string; client_secret?: string; clear_secret?: boolean };
const inputClass = 'w-full rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring';
function ProviderForm({ initial, onSaved }: { initial: Provider; onSaved: (value: Provider) => void }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const google = form.provider === 'google';
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage('');
    try {
      const data = await api(`/auth/providers/manage/${form.provider}`, { method: 'PUT', body: JSON.stringify({ enabled: form.enabled, client_id: form.client_id.trim(), client_secret: form.client_secret || '', clear_secret: form.clear_secret || false, version: form.version }) });
      setForm(data.provider); onSaved(data.provider); setMessage(data.message);
    } catch (error: any) { setMessage(error.message || '保存失败'); }
    finally { setSaving(false); }
  };
  return <form onSubmit={save} className="rounded-[10px] border border-border bg-card p-5 sm:p-6">
    <fieldset disabled={saving} className="min-w-0 space-y-5">
      <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-medium">{form.name}</h2><span className="text-sm text-muted-foreground">{initial.ready ? '已启用' : initial.client_id ? '已配置 · 未启用' : '等待配置'}</span></div>
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />启用 {form.name} 登录</label>
      {google && <p className="text-sm text-muted-foreground">沿用现有 Google 登录，只需 Client ID，无需填写密钥。Google 控制台的“已获授权的 JavaScript 来源”填下方网站来源。</p>}
      <label className="block text-sm"><span className="mb-2 block">{google || ['github', 'gitee'].includes(form.provider) ? 'Client ID' : 'AppID'}</span><input className={inputClass} value={form.client_id} autoComplete="off" spellCheck={false} maxLength={255} onChange={e => setForm({ ...form, client_id: e.target.value })} /></label>
      {!google && <>
        <label className="block text-sm"><span className="mb-2 block">{form.provider === 'qq' ? 'AppKey' : form.provider === 'wechat' ? 'AppSecret' : 'Client Secret'}</span><input className={inputClass} type="password" autoComplete="new-password" value={form.client_secret || ''} maxLength={2048} placeholder={form.has_secret ? '已保存；留空保留原密钥' : '申请通过后填写'} onChange={e => setForm({ ...form, client_secret: e.target.value, clear_secret: false })} /></label>
        {form.has_secret && <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.clear_secret || false} onChange={e => setForm({ ...form, clear_secret: e.target.checked, client_secret: '', enabled: e.target.checked ? false : form.enabled })} />清除已保存的密钥并停用</label>}
      </>}
      <div className="rounded-[8px] bg-muted p-4 text-sm"><p className="mb-2 text-muted-foreground">{google ? '网站来源' : '回调地址'}</p><code className="break-all select-all">{google ? form.origin : form.callback_url}</code>
        {form.provider === 'wechat' && <p className="mt-3">微信“授权回调域”填写：<code className="select-all">{new URL(form.origin).hostname}</code>。使用微信开放平台的网站应用 AppID。</p>}
      </div>
      <p className="text-xs text-muted-foreground">更换应用 ID 前先停用；更换后需重新填写密钥，原应用的账号绑定不会自动转移。</p>
      {message && <p role="status" className="text-sm">{message}</p>}
      <button className="neo-button neo-button-dark" type="submit">{saving ? '保存中…' : `保存 ${form.name} 设置`}</button>
    </fieldset>
  </form>;
}
export default function AdminLoginSettingsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setError('');
    api('/auth/providers/manage').then(data => { if (active) setProviders(data.providers); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [attempt]);
  return <div className="max-w-5xl mx-auto py-2">
    <h1 className="admin-title">第三方登录</h1>
    <p className="mt-2 mb-8 text-sm text-muted-foreground">审核通过后填写应用信息，再启用登录。设置仅站长可管理，密钥加密保存。未取得邮箱的注册需要邮件验证码，请先确认邮件设置可正常发送。</p>
    {error ? <div role="alert">{error}<button className="text-link ml-3" onClick={() => setAttempt(x => x + 1)}>重新加载</button></div> : !providers.length ? <p role="status">正在加载登录设置…</p> :
      <div className="space-y-6">{providers.map(p => <ProviderForm key={`${attempt}-${p.provider}`} initial={p} onSaved={value => setProviders(items => items.map(item => item.provider === value.provider ? value : item))} />)}</div>}
  </div>;
}
