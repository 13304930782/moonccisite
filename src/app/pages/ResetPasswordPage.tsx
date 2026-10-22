import { FormEvent, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {authLink,loginDestination} from '../lib/loginDestination';
import { api } from '../lib/api';
import { AuthShell } from '../components/AuthShell';
import { PasswordField, PasswordRules } from '../components/PasswordField';
import { passwordProblem } from '../lib/passwordRules';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const destination=loginDestination(params.get('redirect'));
  const [token] = useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('token')||params.get('token')||'');
  useEffect(()=>{const url=new URL(window.location.href);url.searchParams.delete('token');if(url.hash.startsWith('#token='))url.hash='';window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);},[]);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [done,setDone] = useState(false);
  const mismatch = confirmTouched && confirmPassword !== '' && password !== confirmPassword;

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!token) {
      setMessage('重置链接缺少 token，请重新申请');
      return;
    }

    if (!password || !confirmPassword) {
      setMessage('请填写新密码和确认密码');
      return;
    }

    const problem = passwordProblem(password);
    if (problem) {
      setMessage(problem);
      return;
    }

    if (password !== confirmPassword) {
      setConfirmTouched(true);
      setMessage('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const res = await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });

      setMessage(res.message || '密码已重置，请重新登录');
      setDone(true);
    } catch (err: any) {
      setMessage(err.message || '重置失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell formTitle="重置密码" formDescription="请设置一个新密码。"
      alternatePrompt="" alternateLabel="返回登录" alternateTo={authLink('/login',destination)}>
        {message && (
          <div className={`auth-message${done ? ' is-success' : ' is-error'}`} role={done ? 'status' : 'alert'}>
            {message}
          </div>
        )}

        {!token && <p className="mt-5" role="alert">重置链接不完整，请重新获取邮件中的链接。</p>}
        {(!token || (message && !done)) && <Link className="text-link block mt-4" to={authLink('/forgot-password',destination)}>重新获取重置链接 →</Link>}
        {done && <Link className="auth-submit mt-6" to={authLink('/login',destination)}>使用新密码登录 →</Link>}
        {token && !done && <form onSubmit={submit} className="auth-form">
          <div>
            <PasswordField
              id="new-password" name="password" label="新密码" required autoComplete="new-password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 位，并包含字母和数字"
            />
            <PasswordRules password={password} />
          </div>

          <PasswordField
            id="confirm-password" name="confirmPassword" label="确认新密码" required autoComplete="new-password" value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onBlur={() => setConfirmTouched(true)}
            error={mismatch ? '两次输入的密码不一致。' : undefined}
            placeholder="再次输入新密码"
          />

          <button
            type="submit"
            disabled={loading}
            className="auth-submit disabled:opacity-60"
          >
            {loading ? '重置中...' : '重置密码'}
          </button>
        </form>}
    </AuthShell>
  );
}
