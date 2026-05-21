import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { api } from '../lib/api';

export default function ForgotPasswordPage() {
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
        body: JSON.stringify({ email }),
      });

      setMessage(res.message || '如果该邮箱存在，我们会发送密码重置邮件');
    } catch (err: any) {
      setMessage(err.message || '发送失败，请稍后重试');
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
          忘记密码
        </h1>

        <p className="mt-2 text-sm text-gray-500">
          输入注册邮箱，我们会发送一封密码重置邮件。
        </p>

        {message && (
          <div className="mt-5 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {message}
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-5">
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700">
              邮箱
            </label>
            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 focus-within:ring-2 focus-within:ring-blue-500">
              <Mail className="w-5 h-5 text-gray-400" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="your@email.com"
                className="w-full bg-transparent outline-none"
              />
            </div>
          </div>

          <button
            disabled={loading}
            className="w-full rounded-2xl bg-blue-600 px-5 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? '发送中...' : '发送重置邮件'}
          </button>
        </form>
      </div>
    </div>
  );
}
