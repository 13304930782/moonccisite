import { useI18n } from '../i18n';
import {rememberDestination} from '../lib/loginDestination';
import { useEffect, useState } from 'react';
import { GoogleSignInButton } from './GoogleSignInButton';
import { api } from '../lib/api';

type Props = { context?: 'signin' | 'signup'; disabled?: boolean; onCredential: (credential: string) => void | Promise<void>; onError: (message: string) => void; returnTo?: string };
type Provider = { provider: string; name: string; client_id?: string };
export function SocialLoginButtons({ context = 'signin', disabled, onError, returnTo }: Props) {
  const { t } = useI18n();
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
    rememberDestination(returnTo || '');
    setBusy(provider);
    try {
      const data = await api(`/auth/${provider}/start`, { method: 'POST', body: JSON.stringify({ return_to: returnTo }) });
      window.location.assign(data.url);
    } catch (error: any) { onError(error.message || t("m_e535b17bc7")); setBusy(''); }
  };
  if (failed) return <p className="mt-5 text-sm text-muted-foreground">{t("m_5e2e75c4ec")}<button type="button" className="text-link ml-2" onClick={() => setAttempt(x => x + 1)}>{t("m_7bdd5ce1e2")}</button></p>;
  if (!providers.length) return null;
  return <div>
    <div className="auth-oauth-divider"><span>{t("m_b7a5f72900")}</span></div>
    {providers.filter(p => p.provider === 'google').map(p => <GoogleSignInButton key={p.provider} context={context} disabled={disabled || Boolean(busy)} onClick={() => void start('google')} busy={busy === 'google'} />)}
    <div className="auth-social-grid">
      {providers.filter(p => p.provider !== 'google').map(p =>
        <button type="button" className="auth-social-button" key={p.provider} disabled={disabled || Boolean(busy)} onClick={() => void start(p.provider)} aria-label={t("m_41aae3f1bf", {v0: p.name, v1: context === 'signup' ? t("m_c4fb62202b") : t("m_1e2df9c307")})}>
          <img className={['github', 'gitee', 'qq', 'wechat'].includes(p.provider) ? 'auth-social-icon-monochrome' : undefined} src={`/login-icons/${p.provider}.svg`} alt="" width="22" height="22" />
          <span>{busy === p.provider ? t("m_332b67ffa0") : p.name}</span>
        </button>)}
    </div>
  </div>;
}
