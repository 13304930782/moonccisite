import { AuthShell } from '../components/AuthShell';
import { FormEvent, useEffect, useState } from 'react';
import { Lock, Mail, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { safeRoutePath } from '../lib/safeUrl';
import { clearAuthCache } from '../lib/authToken';
import { useAuth } from '../context/AuthContext';

const DEFAULT_REDIRECT = '/admin/comments?status=pending';

export default function AdminLoginPage() {
  const { login } = useAuth();
  const [params] = useSearchParams();
  const redirect = safeAdminRedirect(params.get('redirect'));
  const ownerRequired = redirect.startsWith('/admin/early-access');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(
    ownerRequired
      ? '请使用站长账号审核 Early Access 申请。'
      : '为了审核评论，请登录管理员账号。',
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    clearAuthCache();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!email || !password) {
      setMessage('请填写管理员邮箱和密码');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      clearAuthCache();

      const data = { user: await login(email, password) };

      if (!['owner', 'admin'].includes(data.user?.role)) {
        clearAuthCache();
        setMessage(
          '这个账号不是站长或管理员账号，不能进入审核后台。请使用站长或管理员账号登录。',
        );
        return;
      }

      if (ownerRequired && data.user?.role !== 'owner') {
        clearAuthCache();
        setMessage('Early Access 申请包含个人资料，仅站长账号可以查看和审核。');
        return;
      }

      const target = redirect.includes('?')
        ? `${redirect}&admin_login=${Date.now()}`
        : `${redirect}?admin_login=${Date.now()}`;

      window.location.replace(target);
    } catch (err: any) {
      setMessage(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      index=""
      modeLabel=""
      storyTitle=""
      storyDescription=""
      formTitle="管理员登录"
      formDescription={
        ownerRequired ? '使用站长账号审核 Early Access 申请。' : '使用管理员账号继续审核。'
      }
      alternatePrompt="返回阅读"
      alternateLabel="首页"
      alternateTo="/"
    >
      {message && (
        <p className="auth-message" role="status">
          {message}
        </p>
      )}
      <form className="auth-form" onSubmit={submit}>
        <div>
          <label className="auth-field-label" htmlFor="review-email">
            邮箱
          </label>
          <div className="auth-field-control">
            <Mail />
            <input
              id="review-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>
        </div>
        <div>
          <label className="auth-field-label" htmlFor="review-password">
            密码
          </label>
          <div className="auth-field-control">
            <Lock />
            <input
              id="review-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
            />
          </div>
        </div>
        <button className="auth-submit" disabled={loading}>
          {loading ? '登录中…' : '登录并进入审核'}
        </button>
      </form>
    </AuthShell>
  );
}

function safeAdminRedirect(input: string | null) {
  const target = safeRoutePath(input, DEFAULT_REDIRECT);

  if (target === '/admin' || target.startsWith('/admin/') || target.startsWith('/admin?')) {
    return target;
  }

  return DEFAULT_REDIRECT;
}
