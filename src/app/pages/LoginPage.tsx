import { ArrowRight, Lock, Mail } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, googleLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const finishLogin = (user: { role: string }) => {
    navigate(['owner', 'admin', 'editor'].includes(user.role) ? '/admin' : '/');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return setMessage('请填写邮箱');
    if (!password) return setMessage('请填写密码');

    setLoading(true);
    setMessage('');

    try {
      const user = await login(email, password);
      finishLogin(user);
    } catch (err: any) {
      setMessage(err.message || '登录失败，请检查邮箱和密码');
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async (credential: string) => {
    setLoading(true);
    setMessage('');

    try {
      const user = await googleLogin(credential);
      finishLogin(user);
    } catch (err: any) {
      setMessage(err.message || 'Google 登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      index="01 / 02"
      modeLabel="MEMBER LOGIN"
      storyTitle={<>欢迎回来，<br />继续阅读。</>}
      storyDescription="重新进入你的阅读现场，接着参与评论、收藏思考，并把有价值的内容留在自己的知识路径里。"
      formTitle="登录账号"
      formDescription="使用注册邮箱和密码进入 Mooncci Blog。"
      alternatePrompt="还没有账号？"
      alternateLabel="立即注册"
      alternateTo="/register"
    >
      {message && <div className="auth-message" role="status" aria-live="polite">{message}</div>}

      <form onSubmit={submit} className="auth-form">
        <div>
          <label htmlFor="email" className="auth-field-label">邮箱</label>
          <div className="auth-field-control">
            <Mail aria-hidden="true" />
            <input
              type="email"
              name="email"
              id="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </div>
        </div>

        <div>
          <div className="auth-field-label">
            <label htmlFor="password">密码</label>
            <Link to="/forgot-password" className="auth-inline-link">忘记密码？</Link>
          </div>
          <div className="auth-field-control">
            <Lock aria-hidden="true" />
            <input
              type="password"
              name="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
            />
          </div>
        </div>

        <button type="submit" disabled={loading} className="neo-button neo-button-dark auth-submit disabled:opacity-60">
          {loading ? '登录中...' : '登录并继续'}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </form>

      <div className="auth-oauth-divider"><span>或使用快捷登录</span></div>
      <GoogleSignInButton
        disabled={loading}
        onCredential={signInWithGoogle}
        onError={setMessage}
      />
    </AuthShell>
  );
}
