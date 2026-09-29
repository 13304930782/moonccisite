import { FormInput } from '../components/FormInput';
import {authLink, loginDestination} from '../lib/loginDestination';
import { ArrowRight, Lock, Mail, User } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { SocialLoginButtons } from '../components/SocialLoginButtons';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const { register, googleLogin, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const destination = loginDestination(params.get('redirect'));
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username || !email || !password || !confirmPassword) {
      return setMessage('请完整填写用户名、邮箱、密码和确认密码');
    }
    if (
      password.length < 8 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      return setMessage('密码至少 8 位，并且需要同时包含字母和数字');
    }
    if (password !== confirmPassword) return setMessage('两次输入的密码不一致');

    setLoading(true);
    setMessage('');

    try {
      await register(username, email, password);
      setMessage('注册成功，即将跳转登录页');
      navigate(authLink('/login', destination), {replace:true});
    } catch (err: any) {
      setMessage(err.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  const signUpWithGoogle = async (credential: string) => {
    setLoading(true);
    setMessage('');

    try {
      const user = await googleLogin(credential,destination);
      navigate(
        destination || (['owner', 'admin', 'editor'].includes(user.role) ? '/admin' : '/'),
      );
    } catch (err: any) {
      setMessage(err.message || 'Google 注册失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading)
    return (
      <p className="quiet-state" role="status">
        正在确认登录状态…
      </p>
    );
  if (user) return <Navigate to={destination || "/"} replace />;

  return (
    <AuthShell
      index="02 / 02"
      modeLabel="NEW MEMBER"
      storyTitle={
        <>
          创建账号，
          <br />
          加入讨论。
        </>
      }
      storyDescription="注册后可以参与评论、收藏文章；投稿开放时，可在个人中心创建草稿并提交审核。"
      formTitle="注册账号"
      formDescription="填写基础信息，创建你的 mooncci 通行证。"
      alternatePrompt="已经有账号？"
      alternateLabel="去登录"
      alternateTo={authLink('/login', destination)}
    >
      {message && (
        <div
          className={`auth-message ${message.includes('成功') ? 'is-success' : ''}`}
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      )}

      <form onSubmit={submit} className="auth-form">
        <div>
          <label htmlFor="username" className="auth-field-label">
            用户名
          </label>
          <div className="auth-field-control">
            <User aria-hidden="true" />
            <FormInput
              type="text"
              name="username"
              id="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="你的公开名称"
            />
          </div>
        </div>

        <div>
          <label htmlFor="register-email" className="auth-field-label">
            邮箱
          </label>
          <div className="auth-field-control">
            <Mail aria-hidden="true" />
            <FormInput
              type="email"
              name="email"
              id="register-email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </div>
        </div>

        <div>
          <label htmlFor="new-password" className="auth-field-label">
            密码
          </label>
          <div className="auth-field-control">
            <Lock aria-hidden="true" />
            <FormInput
              type="password"
              name="password"
              id="new-password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 8 位，包含字母和数字"
            />
          </div>
        </div>

        <div>
          <label htmlFor="confirm-password" className="auth-field-label">
            确认密码
          </label>
          <div className="auth-field-control">
            <Lock aria-hidden="true" />
            <FormInput
              type="password"
              name="confirmPassword"
              id="confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="再次输入密码"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="neo-button neo-button-dark auth-submit disabled:opacity-60"
        >
          {loading ? '注册中...' : '创建账号'}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </form>

      <SocialLoginButtons returnTo={destination || "/"}
        context="signup"
        disabled={loading}
        onCredential={signUpWithGoogle}
        onError={setMessage}
      />
    </AuthShell>
  );
}
