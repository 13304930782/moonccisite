import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, MessageCircle, Sparkles, UserRound, Mail, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!email.trim()) {
      setMessage('请填写邮箱');
      return;
    }

    if (!password) {
      setMessage('请填写密码');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const user = await login(email, password);

      if (user.role === 'owner' || user.role === 'admin' || user.role === 'editor') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setMessage(err.message || '登录失败，请检查邮箱和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-purple-950 px-4 py-8 flex items-center justify-center">
      <div className="w-full max-w-6xl overflow-hidden rounded-[2rem] bg-transparent shadow-2xl ring-1 ring-white/10 md:grid md:grid-cols-[1.05fr_0.95fr]">
        <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-purple-900 p-8 text-white md:p-10 lg:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.16),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(168,85,247,0.18),transparent_30%)]" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-3 rounded-full bg-white/10 px-4 py-2 backdrop-blur">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500">
                <Sparkles className="h-5 w-5" />
              </div>
              <span className="font-semibold">Mooncci Blog</span>
            </div>

            <h1 className="mt-14 max-w-xl text-[clamp(2.2rem,4.6vw,4.5rem)] font-black leading-[1.08] tracking-tight">
              欢迎来到
              <br />
              Mooncci Blog
            </h1>

            <p className="mt-7 max-w-lg text-base leading-8 text-white/82 md:text-lg">
              登录后，你可以参与评论、点赞文章，继续探索技术、生活与思考的内容。
            </p>

            <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                <BookOpen className="mb-3 h-6 w-6 text-blue-200" />
                <div className="text-xl font-bold">Read</div>
                <div className="mt-1 text-sm text-white/75">阅读文章</div>
              </div>

              <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                <MessageCircle className="mb-3 h-6 w-6 text-purple-200" />
                <div className="text-xl font-bold">Discuss</div>
                <div className="mt-1 text-sm text-white/75">参与评论</div>
              </div>

              <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                <UserRound className="mb-3 h-6 w-6 text-cyan-200" />
                <div className="text-xl font-bold">Account</div>
                <div className="mt-1 text-sm text-white/75">管理账号</div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white/95 p-8 md:p-10 lg:p-12">
          <Link to="/" className="text-sm text-blue-600 hover:underline">
            返回首页
          </Link>

          <div className="mt-8">
            <h2 className="text-3xl font-black text-gray-900">登录账号</h2>
            <p className="mt-3 text-sm leading-6 text-gray-500">
              使用你的邮箱和密码登录，继续访问属于你的内容与互动记录。
            </p>
          </div>

          {message && (
            <div className="mt-7 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
              {message}
            </div>
          )}

          <form onSubmit={submit} className="mt-7 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                邮箱
              </label>
              <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 focus-within:ring-2 focus-within:ring-blue-500">
                <Mail className="h-5 w-5 text-gray-400" />
                <input type="email" name="email" id="email" autoComplete="username" inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                 
                  placeholder="请输入邮箱"
                  className="w-full bg-transparent outline-none"
                />
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">
                  密码
                </label>
                <Link to="/forgot-password" className="text-sm text-blue-600 hover:underline">
                  忘记密码？
                </Link>
              </div>

              <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 focus-within:ring-2 focus-within:ring-blue-500">
                <Lock className="h-5 w-5 text-gray-400" />
                <input type="password" name="password" id="password" autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                 
                  placeholder="请输入密码"
                  className="w-full bg-transparent outline-none"
                />
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-3 font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:scale-[1.01] disabled:opacity-60"
            >
              {loading ? '登录中...' : '登录'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-gray-500">
            还没有账号？
            <Link to="/register" className="ml-2 font-medium text-blue-600 hover:underline">
              立即注册
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
