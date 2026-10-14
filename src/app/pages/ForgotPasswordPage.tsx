import { FormInput } from '../components/FormInput';
import { FormEvent, useState } from 'react';
import {authLink, loginDestination} from '../lib/loginDestination';
import { useSearchParams } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { api } from '../lib/api';
import { AuthShell } from '../components/AuthShell';

export default function ForgotPasswordPage() {
  const [params] = useSearchParams();
  const destination = loginDestination(params.get('redirect'));
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!email.trim()) {
      setMessage('请填写邮箱');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const res = await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email, return_to:destination }),
      });

      setMessage(res.message || '如果该邮箱存在，我们会发送密码重置邮件');
    } catch (err: any) {
      setMessage(err.message || '发送失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell formTitle="忘记密码" formDescription="输入注册邮箱，我们会发送一封密码重置邮件。"
      alternatePrompt="" alternateLabel="返回登录" alternateTo={authLink('/login', destination)}>
        {message && (
          <div className="auth-message" role="status">
            {message}
          </div>
        )}

        <form onSubmit={submit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="recovery-email" className="block mb-2">
              邮箱
            </label>
            <div className="auth-field-control">
              <Mail className="w-5 h-5 text-muted-foreground" />
              <FormInput
                id="recovery-email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="your@email.com"
              />
            </div>
          </div>

          <button
            disabled={loading}
            className="auth-submit disabled:opacity-60"
          >
            {loading ? '发送中...' : '发送重置邮件'}
          </button>
        </form>
    </AuthShell>
  );
}
