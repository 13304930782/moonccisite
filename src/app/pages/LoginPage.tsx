import { FormInput } from '../components/FormInput';
import {authLink, loginDestination, rememberedDestination} from '../lib/loginDestination';
import { ArrowRight, CircleX, Lock, Mail } from 'lucide-react';
import { ApiError } from '../lib/api';
import { notify } from '../lib/feedback';
import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { SocialLoginButtons } from '../components/SocialLoginButtons';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const destination = loginDestination(params.get('redirect')) || (params.get('oauth')?rememberedDestination():'');
  const { login, googleLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(params.get('oauth') === 'email_exists' ? '该邮箱已有账号，请先使用原方式登录，再到账号设置绑定。' : params.get('oauth') === 'failed' ? '第三方登录未完成，授权可能已取消、过期或账号不可用，请重试。' : '');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const finishLogin = (user: { role: string }) => {
    const redirect = destination;
    navigate(
      Boolean(redirect)
        ? redirect
        : ['owner', 'admin', 'editor'].includes(user.role)
          ? '/admin'
          : '/',
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) return;

    setLoading(true);
    setMessage('');
    setFormError('');

    try {
      const user = await login(email, password);
      finishLogin(user);
    } catch (err: any) {
      const connectionError = err instanceof ApiError &&
        (['network', 'timeout', 'format'].includes(err.kind) || err.status >= 500);
      const text = connectionError
        ? '暂未确认登录结果，请刷新页面后重试。'
        : err.message || '登录失败，请检查邮箱和密码。';
      setFormError(text);
      if (connectionError) notify.error(err.kind === 'timeout' ? '登录请求超时，请稍后重试。' : '暂时无法连接，请检查网络后重试。');
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async (credential: string) => {
    setLoading(true);
    setMessage('');

    try {
      const user = await googleLogin(credential,destination);
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
      storyTitle={
        <>
          欢迎回来，
          <br />
          继续阅读。
        </>
      }
      storyDescription="阅读技术笔记，参与讨论，继续探索感兴趣的主题。"
      formTitle="登录账号"
      formDescription="使用注册邮箱和密码进入 mooncci。"
      alternatePrompt="还没有账号？"
      alternateLabel="立即注册"
      alternateTo={authLink('/register', destination)}
    >
      {message && (
        <div id="login-error" className="auth-message" role="alert">
          {message}
        </div>
      )}

      <form onSubmit={submit} className="auth-form">
        <div>
          <label htmlFor="email" className="auth-field-label">
            邮箱
          </label>
          <div className="auth-field-control">
            <Mail aria-hidden="true" />
            <FormInput
              type="email"
              required
              aria-describedby={formError ? "login-form-error" : undefined}
              name="email"
              id="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(event) => { setEmail(event.target.value); setFormError(''); }}
              placeholder="name@example.com"
            />
          </div>
        </div>

        <div>
          <div className="auth-field-label">
            <label htmlFor="password">密码</label>
            <Link to={authLink('/forgot-password', destination)} className="auth-inline-link">
              忘记密码？
            </Link>
          </div>
          <div className="auth-field-control">
            <Lock aria-hidden="true" />
            <FormInput
              type="password"
              required
              aria-describedby={formError ? "login-form-error" : undefined}
              name="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => { setPassword(event.target.value); setFormError(''); }}
              placeholder="请输入密码"
            />
          </div>
          {formError && (
            <p id="login-form-error" className="auth-form-error" role="alert">
              <CircleX size={16} aria-hidden="true" />
              <span>{formError}</span>
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="neo-button neo-button-dark auth-submit disabled:opacity-60"
        >
          {loading ? '登录中...' : '登录并继续'}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </form>

      <SocialLoginButtons
        returnTo={destination || '/'}
        disabled={loading}
        onCredential={signInWithGoogle}
        onError={setMessage}
      />
    </AuthShell>
  );
}
