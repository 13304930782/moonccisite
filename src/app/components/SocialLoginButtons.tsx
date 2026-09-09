import { useEffect, useState } from 'react';
import { GoogleSignInButton } from './GoogleSignInButton';
import { api } from '../lib/api';

type Props = { context?: 'signin' | 'signup'; disabled?: boolean; onCredential: (credential: string) => void | Promise<void>; onError: (message: string) => void; returnTo?: string };
type Provider = { provider: string; name: string; client_id?: string };
export function SocialLoginButtons({ context = 'signin', disabled, onCredential, onError, returnTo }: Props) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [busy, setBusy] = useState('');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setFailed(false);
    api('/auth/providers').then(data => { if (active) setProviders(data.providers); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [attempt]);
  const start = async (provider: string) => {
    setBusy(provider);
    try {
      const data = await api(`/auth/${provider}/start`, { method: 'POST', body: JSON.stringify({ return_to: returnTo }) });
      window.location.assign(data.url);
    } catch (error: any) { onError(error.message || '暂时无法登录，请重试。'); setBusy(''); }
  };
  if (failed) return <p className="mt-5 text-sm text-muted-foreground">快捷登录暂时不可用。<button type="button" className="text-link ml-2" onClick={() => setAttempt(x => x + 1)}>重新加载</button></p>;
  if (!providers.length) return null;
  return <div>
    <div className="auth-oauth-divider"><span>或使用快捷登录</span></div>
    {providers.filter(p => p.provider === 'google').map(p => <GoogleSignInButton key={p.provider} clientId={p.client_id!} context={context} disabled={disabled || Boolean(busy)} onCredential={onCredential} onError={onError} />)}
    <div className="auth-social-grid">
      {providers.filter(p => p.provider !== 'google').map(p =>
        <button type="button" className="auth-social-button" key={p.provider} disabled={disabled || Boolean(busy)} onClick={() => void start(p.provider)} aria-label={`使用 ${p.name} ${context === 'signup' ? '注册' : '登录'}`}>
          <img src={`/login-icons/${p.provider}.svg`} alt="" width="22" height="22" />
          <span>{busy === p.provider ? '跳转中…' : p.name}</span>
        </button>)}
    </div>
  </div>;
}
