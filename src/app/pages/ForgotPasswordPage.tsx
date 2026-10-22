import { FormInput } from '../components/FormInput';
import { FormEvent, useEffect, useState } from 'react';
import {authLink, loginDestination} from '../lib/loginDestination';
import { useSearchParams } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { api } from '../lib/api';
import { AuthShell } from '../components/AuthShell';

const RESEND_SECONDS = 60;

export default function ForgotPasswordPage() {
  const [params] = useSearchParams();
  const destination = loginDestination(params.get('redirect'));
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [serverMessage, setServerMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const request = async (address: string) => {
    setLoading(true);
    setError('');

    try {
      const res = await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: address, return_to: destination }),
      });

      setServerMessage(res.message || '如果该邮箱存在，我们会发送密码重置邮件');
      setSentTo(address);
      setCooldown(RESEND_SECONDS);
    } catch (err: any) {
      setError(err.message || '发送失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!address) {
      setError('请填写注册时使用的邮箱。');
      return;
    }
    await request(address);
  };

  return (
    <AuthShell formTitle="忘记密码" formDescription="输入注册邮箱，我们会发送一封密码重置邮件。"
      alternatePrompt="" alternateLabel="返回登录" alternateTo={authLink('/login', destination)}>
        {error && (
          <div className="auth-message is-error" role="alert">
            {error}
          </div>
        )}

        {sentTo ? (
          <section className="auth-sent" aria-labelledby="recovery-sent-title" role="status">
            <h2 id="recovery-sent-title">请查收邮件</h2>
            <p>{serverMessage}</p>
            <p>邮件将发送至 <strong>{sentTo}</strong>，链接 30 分钟内有效。没有收到时，请检查垃圾邮件文件夹。</p>
            <div className="inline-actions">
              <button type="button" className="auth-secondary" disabled={loading || cooldown > 0} onClick={() => void request(sentTo)}>
                {loading ? '发送中…' : cooldown > 0 ? `${cooldown} 秒后可重新发送` : '重新发送'}
              </button>
              <button type="button" className="auth-secondary" onClick={() => { setSentTo(''); setError(''); }}>更换邮箱</button>
            </div>
          </section>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <div className="auth-field">
              <div className="auth-field-label">
                <label htmlFor="recovery-email">邮箱</label>
              </div>
              <div className="auth-field-control">
                <Mail aria-hidden="true" />
                <FormInput
                  id="recovery-email" name="email" required autoComplete="email" inputMode="email" autoCapitalize="none"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  type="email"
                  placeholder="your@email.com"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="auth-submit disabled:opacity-60"
            >
              {loading ? '发送中...' : '发送重置邮件'}
            </button>
          </form>
        )}
    </AuthShell>
  );
}
