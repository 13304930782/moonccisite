import '../components/AuthShell.css';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
type Provider = { provider: string; name: string; enabled: boolean; bound: boolean; client_id?: string };
export default function AccountConnectionsPage() {
  const [params] = useSearchParams();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [message, setMessage] = useState(params.get('oauth') === 'bound' ? '账号已绑定。' : params.get('oauth') === 'failed' ? '绑定未完成。请确认授权账号未绑定其他用户，并重新尝试。' : '');
  const [busy, setBusy] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true; setFailed(false);
    api('/auth/connections').then(data => { if (active) setProviders(data.providers); }).catch(e => { if (active) { setMessage(e.message); setFailed(true); } });
    return () => { active = false; };
  }, [attempt]);
  const bind = async (provider: string) => {
    setBusy(provider); setMessage('');
    try {
      const data = await api(`/auth/${provider}/start`, { method: 'POST', body: JSON.stringify({ mode: 'bind' }) });
      window.location.assign(data.url);
    } catch (e: any) { setMessage(e.message); setBusy(''); }
  };
  return <main className="site-container page-content"><div className="max-w-2xl mx-auto">
    <h1 className="admin-title">账号绑定</h1><p className="mt-3 mb-8 text-muted-foreground">绑定后，可使用对应平台登录当前账号。请确认授权的是你自己的账号。</p>
    {message && <p role="status" className="mb-5 bg-muted p-4 rounded-[10px]">{message}</p>}
    {failed && <button className="neo-button" onClick={() => setAttempt(x => x + 1)}>重新加载</button>}
    {!failed && !providers.length && <p role="status">正在加载…</p>}
    <div className="space-y-4">{providers.map(p => <section key={p.provider} className="border border-border bg-card rounded-[10px] p-5">
      <div className="flex justify-between gap-4 mb-3"><h2 className="font-medium">{p.name}</h2><span className="text-sm text-muted-foreground">{p.bound ? p.enabled ? '已绑定' : '已绑定 · 渠道未启用' : p.enabled ? '未绑定' : '暂未开放'}</span></div>
      {!p.bound && p.enabled && (p.provider === 'google' ? <GoogleSignInButton disabled={Boolean(busy)} onClick={() => void bind('google')} busy={busy === 'google'} /> : <button className="neo-button" disabled={Boolean(busy)} onClick={() => void bind(p.provider)}>{busy === p.provider ? '正在跳转…' : `绑定 ${p.name}`}</button>)}
    </section>)}</div>
  </div></main>;
}
