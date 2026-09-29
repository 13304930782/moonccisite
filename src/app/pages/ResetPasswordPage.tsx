import { FormInput } from '../components/FormInput';
import { FormEvent, useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import {authLink,loginDestination} from '../lib/loginDestination';
import { api } from '../lib/api';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const destination=loginDestination(params.get('redirect'));
  const [token] = useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('token')||params.get('token')||'');
  useEffect(()=>{const url=new URL(window.location.href);url.searchParams.delete('token');if(url.hash.startsWith('#token='))url.hash='';window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);},[]);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [done,setDone] = useState(false);

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

    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setMessage('新密码至少 8 位，并且需要同时包含字母和数字');
      return;
    }

    if (password !== confirmPassword) {
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
    <div className="neo-dot-grid flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-[12px] border border-border bg-card p-8 shadow-none">
        <Link to={authLink('/login',destination)} className="text-sm font-semibold text-foreground hover:underline">
          返回登录
        </Link>

        <h1 className="neo-heading mt-5 text-4xl text-foreground">
          重置密码
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          请设置一个新密码。
        </p>

        {message && (
          <div className={`mt-5 rounded-[10px] px-4 py-3 text-sm ${
            done ? 'bg-muted text-foreground' : 'bg-red-50 text-red-600'
          }`}>
            {message}
          </div>
        )}

        {!token && <p className="mt-5" role="alert">重置链接不完整，请重新获取邮件中的链接。</p>}
        {(!token || (message && !done)) && <Link className="text-link block mt-4" to={authLink('/forgot-password',destination)}>重新获取重置链接 →</Link>}
        {done && <Link className="neo-button neo-button-dark mt-6" to={authLink('/login',destination)}>使用新密码登录 →</Link>}
        {token && !done && <form onSubmit={submit} className="mt-6 space-y-5">
          <div>
            <label htmlFor="new-password" className="block mb-2 text-sm font-medium text-foreground">
              新密码
            </label>
            <div className="neo-input flex items-center gap-3 px-4 py-3">
              <Lock className="w-5 h-5 text-muted-foreground" />
              <FormInput
                id="new-password" autoComplete="new-password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="至少 8 位，并包含字母和数字"
                className="w-full bg-transparent outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="confirm-password" className="block mb-2 text-sm font-medium text-foreground">
              确认新密码
            </label>
            <div className="neo-input flex items-center gap-3 px-4 py-3">
              <Lock className="w-5 h-5 text-muted-foreground" />
              <FormInput
                id="confirm-password" autoComplete="new-password" value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type="password"
                placeholder="再次输入新密码"
                className="w-full bg-transparent outline-none"
              />
            </div>
          </div>

          <button
            disabled={loading}
            className="neo-button neo-button-dark w-full px-5 py-3 disabled:opacity-60"
          >
            {loading ? '重置中...' : '重置密码'}
          </button>
        </form>}
      </div>
    </div>
  );
}
