import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function CompleteRegistrationPage() {
  const [provider, setProvider] = useState('');
  const [expired, setExpired] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    let active = true;
    api('/auth/registration').then(data => { if (active) setProvider(data.provider); }).catch(e => { if (active) { setExpired(true); setMessage(e.message); } });
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
      const data = await api('/auth/registration/email', { method: 'POST', body: JSON.stringify({ email }) });
      setMessage(data.message); setCooldown(60);
    } catch (e: any) { setMessage(e.message); }
    finally { setBusy(false); }
  };
  const complete = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const data = await api('/auth/registration/complete', { method: 'POST', body: JSON.stringify({ email, code }) });
      window.location.assign(data.redirect);
    } catch (e: any) { setMessage(e.message); setBusy(false); }
  };
  return <main className="site-container page-content"><div className="max-w-md mx-auto py-8">
    <p className="text-sm text-muted-foreground mb-5">完成注册</p><h1 className="admin-title">绑定邮箱</h1>
    <p className="mt-4 mb-8 text-muted-foreground">{provider ? `已获得 ${provider} 授权。` : ''}验证一个常用邮箱后，即可完成注册。邮箱用于账号找回和接收通知。</p>
    {message && <p role="status" className="mb-5 bg-muted p-4 rounded-[10px]">{message}</p>}
    {!expired && provider && <form onSubmit={complete} className="space-y-5">
      <label className="block text-sm">邮箱<input required type="email" autoComplete="email" maxLength={120} value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full border border-border rounded-[8px] bg-card px-4 py-3" placeholder="name@example.com" /></label>
      <button type="button" disabled={busy || cooldown > 0 || !email} onClick={() => void send()} className="neo-button disabled:opacity-60">{cooldown > 0 ? `${cooldown} 秒后重新发送` : '发送验证码'}</button>
      <label className="block text-sm">验证码<input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} className="mt-2 w-full border border-border rounded-[8px] bg-card px-4 py-3" placeholder="6 位数字" /></label>
      <button type="submit" disabled={busy} className="neo-button neo-button-dark w-full justify-center disabled:opacity-60">{busy ? '正在处理…' : '验证邮箱并完成注册'}</button>
    </form>}
    <p className="mt-8 text-sm text-muted-foreground">邮箱已有账号？<Link className="text-link ml-2" to="/login">先登录，再绑定</Link></p>
  </div></main>;
}
