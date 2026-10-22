import { FormInput } from '../components/FormInput';
import {authLink, loginDestination} from '../lib/loginDestination';
import { ArrowRight, Mail, User } from 'lucide-react';
import { PasswordField, PasswordRules } from '../components/PasswordField';
import { passwordProblem } from '../lib/passwordRules';
import { notify } from '../lib/feedback';
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

  const [confirmTouched, setConfirmTouched] = useState(false);
  const mismatch = confirmTouched && confirmPassword !== '' && password !== confirmPassword;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !email.trim() || !password || !confirmPassword) {
      return setMessage('请完整填写用户名、邮箱、密码和确认密码');
    }
    const problem = passwordProblem(password);
    if (problem) return setMessage(problem);
    if (password !== confirmPassword) { setConfirmTouched(true); return setMessage('两次输入的密码不一致'); }

    setLoading(true);
    setMessage('');

    try {
      await register(username.trim(), email.trim(), password);
      notify.success('注册成功，请使用新账号登录。');
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
        <div className="auth-message is-error" role="alert">
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
              required
              minLength={2}
              maxLength={30}
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
              required
              maxLength={254}
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </div>
        </div>

        <div>
          <PasswordField
            id="new-password"
            name="password"
            label="密码"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="至少 8 位，包含字母和数字"
          />
          <PasswordRules password={password} />
        </div>

        <PasswordField
          id="confirm-password"
          name="confirmPassword"
          label="确认密码"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          onBlur={() => setConfirmTouched(true)}
          error={mismatch ? '两次输入的密码不一致。' : undefined}
          placeholder="再次输入密码"
        />

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
