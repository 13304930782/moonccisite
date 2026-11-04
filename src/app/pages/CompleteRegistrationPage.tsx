import { useI18n } from '../i18n';
import { FormEvent, useEffect, useState } from 'react';
import {authLink,loginDestination,rememberedDestination} from '../lib/loginDestination';
import {useSearchParams } from 'react-router-dom';
import {Link} from '../components/LocaleLink';
import { api } from '../lib/api';

export default function CompleteRegistrationPage() {
  const { t,locale } = useI18n();
  const [params]=useSearchParams();
  const [destination,setDestination]=useState(()=>loginDestination(params.get('redirect'))||rememberedDestination());
  const [provider, setProvider] = useState('');
  const [expired, setExpired] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    let active = true;
    api('/auth/registration').then(data => { if (active) {setProvider(data.provider);setDestination(loginDestination(data.redirect)||destination);} }).catch(e => { if (active) { setExpired(true); setMessage(e.message); } });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(x => x - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  const send = async () => {
    setBusy(true); setMessage('');
    try {
      const data = await api('/auth/registration/email', { method: 'POST', body: JSON.stringify({ email,locale }) });
      setMessage(data.message); setCooldown(60);
    } catch (e: any) { setMessage(e.message); }
    finally { setBusy(false); }
  };
  const complete = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const data = await api('/auth/registration/complete', { method: 'POST', body: JSON.stringify({ email, code,locale }) });
      window.location.assign(loginDestination(data.redirect)||'/');
    } catch (e: any) { setMessage(e.message);if(e.status===409)setExpired(true);setBusy(false); }
  };
  return <main className="site-container page-content"><div className="max-w-md mx-auto py-8">
    <p className="text-sm text-muted-foreground mb-5">{t("m_8aa3eb2508")}</p><h1 className="admin-title">{t("m_6d4b7dce1e")}</h1>
    <p className="mt-4 mb-8 text-muted-foreground">{provider ? t("m_0689db1448", {v0: provider}) : ''}{t("m_152720c4c0")}</p>
    {message && <p role="status" className="mb-5 bg-muted p-4 rounded-[10px]">{t(message || '')}</p>}
    {!expired && provider && <form onSubmit={complete} className="space-y-5">
      <label className="block text-sm">{t("m_73075237fd")}<input required type="email" autoComplete="email" maxLength={120} value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full border border-border rounded-[8px] bg-card px-4 py-3" placeholder="name@example.com" /></label>
      <button type="button" disabled={busy || cooldown > 0 || !email} onClick={() => void send()} className="neo-button disabled:opacity-60">{cooldown > 0 ? t("m_abda5168de", {v0: cooldown}) : t("m_4656fed515")}</button>
      <label className="block text-sm">{t("m_bb015c60ba")}<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} className="mt-2 w-full border border-border rounded-[8px] bg-card px-4 py-3" placeholder={t("m_7ce6963f19")} /></label>
      <button type="submit" disabled={busy} className="neo-button neo-button-dark w-full justify-center disabled:opacity-60">{busy ? t("m_574ec7517d") : t("m_7c58dd4474")}</button>
    </form>}
    <p className="mt-8 text-sm text-muted-foreground">{expired?t("m_c09da2e305"):t("m_a17a805971")}<Link className="text-link ml-2" to={authLink('/login',destination)}>{t("m_4e95011c9d")}</Link></p>
  </div></main>;
}
