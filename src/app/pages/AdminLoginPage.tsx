import { FormEvent, useEffect, useState } from 'react';
import { Lock, Mail, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { safeRoutePath } from '../lib/safeUrl';
import { clearAuthCache } from '../lib/authToken';

const DEFAULT_REDIRECT = '/admin/comments?status=pending';

export default function AdminLoginPage() {
  const [params] = useSearchParams();
  const redirect = safeAdminRedirect(params.get('redirect'));
  const ownerRequired = redirect.startsWith('/admin/early-access');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(ownerRequired ? '请使用站长账号审核 Early Access 申请。' : '为了审核评论，请登录管理员账号。');
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

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ email, password }),
      });

      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? await res.json()
        : { message: '接口返回异常，请检查后端 /api 代理' };

      if (!res.ok) {
        throw new Error(data.message || '登录失败');
      }

      if (!['owner', 'admin'].includes(data.user?.role)) {
        clearAuthCache();
        setMessage('这个账号不是站长或管理员账号，不能进入审核后台。请使用站长或管理员账号登录。');
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
    <div className="neo-dot-grid flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-[12px] border-2 border-black bg-white p-8 shadow-[8px_8px_0_#000]">
        <Link to="/" className="text-sm font-black text-black hover:underline">
          返回首页
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center border-2 border-black bg-[#ffe17c] text-black shadow-[3px_3px_0_#000]">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="neo-heading text-3xl text-black">
              管理员审核登录
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {ownerRequired ? 'Early Access 申请仅允许站长账号审核。' : '仅站长或管理员账号可以进入评论审核页面。'}
            </p>
          </div>
        </div>

        {message && (
          <div className="mt-6 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {message}
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-5">
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700">
              管理员邮箱
            </label>
            <div className="neo-input flex items-center gap-3 px-4 py-3">
              <Mail className="w-5 h-5 text-gray-400" />
              <input type="email" name="email" id="email" autoComplete="username" inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
               
                placeholder="admin@example.com"
                className="w-full bg-transparent outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700">
              管理员密码
            </label>
            <div className="neo-input flex items-center gap-3 px-4 py-3">
              <Lock className="w-5 h-5 text-gray-400" />
              <input type="password" name="password" id="password" autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
               
                placeholder="请输入管理员密码"
                className="w-full bg-transparent outline-none"
              />
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="neo-button neo-button-dark w-full px-5 py-3 disabled:opacity-60"
          >
            {loading ? '登录中...' : '登录并进入审核'}
          </button>
        </form>
      </div>
    </div>
  );
}

function safeAdminRedirect(input: string | null) {
  const target = safeRoutePath(input, DEFAULT_REDIRECT);

  if (
    target === '/admin' ||
    target.startsWith('/admin/') ||
    target.startsWith('/admin?')
  ) {
    return target;
  }

  return DEFAULT_REDIRECT;
}
