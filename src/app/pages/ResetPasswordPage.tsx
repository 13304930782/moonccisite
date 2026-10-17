import { FormInput } from '../components/FormInput';
import { FormEvent, useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import {authLink,loginDestination} from '../lib/loginDestination';
import { api } from '../lib/api';
import { AuthShell } from '../components/AuthShell';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate=useNavigate(), location=useLocation();
  const destination=loginDestination(params.get('redirect'));
  const [token] = useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('token')||params.get('token')||'');
  useEffect(()=>{
    const url=new URL(window.location.href), fragment=new URLSearchParams(url.hash.slice(1));
    url.searchParams.delete('token');
    if(fragment.has('token')){fragment.delete('token');url.hash=fragment.toString();}
    if(url.search!==location.search||url.hash!==location.hash)navigate({pathname:location.pathname,search:url.search,hash:url.hash},{replace:true,state:location.state});
  },[location.pathname,location.search,location.hash,location.state,navigate]);

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
    <AuthShell formTitle="重置密码" formDescription="请设置一个新密码。"
      alternatePrompt="" alternateLabel="返回登录" alternateTo={authLink('/login',destination)}>
        {message && (
          <div className={`auth-message${done ? '' : ' is-error'}`} role={done ? 'status' : 'alert'}>
            {message}
          </div>
        )}

        {!token && <p className="mt-5" role="alert">重置链接不完整，请重新获取邮件中的链接。</p>}
        {(!token || (message && !done)) && <Link className="text-link block mt-4" to={authLink('/forgot-password',destination)}>重新获取重置链接 →</Link>}
        {done && <Link className="auth-submit mt-6" to={authLink('/login',destination)}>使用新密码登录 →</Link>}
        {token && !done && <form onSubmit={submit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="new-password" className="block mb-2">
              新密码
            </label>
            <div className="auth-field-control">
              <Lock className="w-5 h-5 text-muted-foreground" />
              <FormInput
                id="new-password" autoComplete="new-password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="至少 8 位，并包含字母和数字"
              />
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="confirm-password" className="block mb-2">
              确认新密码
            </label>
            <div className="auth-field-control">
              <Lock className="w-5 h-5 text-muted-foreground" />
              <FormInput
                id="confirm-password" autoComplete="new-password" value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type="password"
                placeholder="再次输入新密码"
              />
            </div>
          </div>

          <button
            disabled={loading}
            className="auth-submit disabled:opacity-60"
          >
            {loading ? '重置中...' : '重置密码'}
          </button>
        </form>}
    </AuthShell>
  );
}
