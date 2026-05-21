import { FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { api } from '../lib/api';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

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
    } catch (err: any) {
      setMessage(err.message || '重置失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-purple-950 px-6 py-10 flex items-center justify-center">
      <div className="w-full max-w-md rounded-[2rem] bg-white/95 p-8 shadow-2xl">
        <Link to="/login" className="text-sm text-blue-600 hover:underline">
          返回登录
        </Link>

        <h1 className="mt-5 text-3xl font-bold text-gray-900">
          重置密码
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          请设置一个新密码。
        </p>

        {message && (
          <div className={`mt-5 rounded-2xl px-4 py-3 text-sm ${
            message.includes('已重置') ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-600'
          }`}>
            {message}
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-5">
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700">
              新密码
            </label>
            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 focus-within:ring-2 focus-within:ring-blue-500">
              <Lock className="w-5 h-5 text-gray-400" />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder="至少 8 位，并包含字母和数字"
                className="w-full bg-transparent outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700">
              确认新密码
            </label>
            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 focus-within:ring-2 focus-within:ring-blue-500">
              <Lock className="w-5 h-5 text-gray-400" />
              <input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type="password"
                placeholder="再次输入新密码"
                className="w-full bg-transparent outline-none"
              />
            </div>
          </div>

          <button
            disabled={loading}
            className="w-full rounded-2xl bg-blue-600 px-5 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? '重置中...' : '重置密码'}
          </button>
        </form>
      </div>
    </div>
  );
}
