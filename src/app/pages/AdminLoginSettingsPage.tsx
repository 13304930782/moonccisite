import { notify } from '../lib/feedback';
import { useEffect, useState } from 'react';
import { useUnsavedLeave } from '../lib/useUnsavedLeave';
import { AdminEmpty, AdminError, AdminLoading } from '../components/admin/AdminState';
import { api } from '../lib/api';

type Provider = { provider: string; name: string; enabled: boolean; ready: boolean; client_id: string; has_secret: boolean; version: number; source: string; callback_url: string; origin: string; client_secret?: string; clear_secret?: boolean };
const inputClass = 'w-full rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring';
function ProviderForm({ initial, onSaved }: { initial: Provider; onSaved: (value: Provider) => void }) {
  const [form, setForm] = useState(initial);
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
    } catch (error: any) { setMessage(error.message || '保存失败'); notify.error(error.message || '保存失败'); }
    finally { setSaving(false); }
  };
  return <form onSubmit={save} className="admin-settings-section">
    <fieldset disabled={saving} className="min-w-0 space-y-5">
      <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-medium">{form.name}</h2><span className="text-sm text-muted-foreground">{initial.ready ? '已启用' : initial.client_id ? '已配置 · 未启用' : '等待配置'}</span></div>
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />启用 {form.name} 登录</label>
      {form.provider==='microsoft'&&<p className="text-sm text-muted-foreground">在 Microsoft Entra 应用注册中选择“任何组织目录中的账号和个人 Microsoft 账号”，平台选 Web，填写下方回调地址。Client Secret 填“值”，不是密钥 ID；密钥到期后需更新。新注册需在本站验证邮箱。</p>}
      {google && <p className="text-sm text-muted-foreground">使用普通按钮跳转 Google 登录，只需现有 Client ID，无需密钥。请在 Google 控制台为此应用添加下方“已获授权的重定向 URI”；原有 CF 验签配置继续生效。</p>}
      <label className="block text-sm"><span className="mb-2 block">{google || ['github', 'gitee', 'microsoft'].includes(form.provider) ? 'Client ID' : 'AppID'}</span><input className={inputClass} value={form.client_id} autoComplete="off" spellCheck={false} maxLength={255} onChange={e => setForm({ ...form, client_id: e.target.value })} /></label>
      {!google && <>
        <label className="block text-sm"><span className="mb-2 block">{form.provider === 'qq' ? 'AppKey' : form.provider === 'wechat' ? 'AppSecret' : 'Client Secret'}</span><input className={inputClass} type="password" autoComplete="new-password" value={form.client_secret || ''} maxLength={2048} placeholder={form.has_secret ? '已保存；留空保留原密钥' : '申请通过后填写'} onChange={e => setForm({ ...form, client_secret: e.target.value, clear_secret: false })} /></label>
        {form.has_secret && <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.clear_secret || false} onChange={e => setForm({ ...form, clear_secret: e.target.checked, client_secret: '', enabled: e.target.checked ? false : form.enabled })} />清除已保存的密钥并停用</label>}
      </>}
      <div className="rounded-[8px] bg-muted p-4 text-sm"><p className="mb-2 text-muted-foreground">{google ? '已获授权的重定向 URI' : '回调地址'}</p><code className="break-all select-all">{form.callback_url}</code>
        {form.provider === 'wechat' && <p className="mt-3">微信“授权回调域”填写：<code className="select-all">{new URL(form.origin).hostname}</code>。使用微信开放平台的网站应用 AppID。</p>}
      </div>
      <p className="text-xs text-muted-foreground">更换应用 ID 前先停用；更换后需重新填写密钥，原应用的账号绑定不会自动转移。</p>
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      <div className="flex flex-wrap items-center gap-3"><button className="neo-button neo-button-dark" type="submit" disabled={!dirty}>{saving ? '保存中…' : `保存 ${form.name} 设置`}</button><button type="button" className="neo-button" disabled={!dirty} onClick={() => { setForm(initial); setMessage(''); }}>放弃更改</button><span role="status" className="text-sm text-muted-foreground">{dirty ? '有未保存的更改' : '已保存'}</span></div>
    </fieldset>
  </form>;
}
export default function AdminLoginSettingsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setError(''); setLoading(true);
    api('/auth/providers/manage').then(data => { if (active) setProviders(data.providers); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  return <div className="admin-page">
    <h1 className="admin-title">第三方登录</h1>
    <p className="mt-2 mb-8 text-sm text-muted-foreground">审核通过后填写应用信息，再启用登录。设置仅站长可管理，密钥加密保存。未取得邮箱的注册需要邮件验证码，请先确认邮件设置可正常发送。</p>
    {loading ? <AdminLoading label="正在加载登录设置…" /> : error ? <AdminError message={error} onRetry={() => setAttempt(x => x + 1)} /> : !providers.length ? <AdminEmpty title="暂无可配置的登录方式" /> :
      <div className="space-y-6">{providers.map(p => <ProviderForm key={`${attempt}-${p.provider}`} initial={p} onSaved={value => setProviders(items => items.map(item => item.provider === value.provider ? value : item))} />)}</div>}
  </div>;
}
