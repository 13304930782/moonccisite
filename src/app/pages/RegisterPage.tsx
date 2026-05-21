import { motion } from 'motion/react';
import { ArrowRight, Lock, Mail, Sparkles, User } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!username || !email || !password || !confirmPassword) {
      setMessage('请完整填写用户名、邮箱、密码和确认密码');
      return;
    }

    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setMessage('密码至少 8 位，并且需要同时包含字母和数字');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      await register(username, email, password);
      setMessage('注册成功，即将跳转登录页');
      setTimeout(() => navigate('/login'), 700);
    } catch (err: any) {
      setMessage(err.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-950 px-6 py-10 flex items-center justify-center">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-10 left-10 w-80 h-80 rounded-full bg-purple-500/25 blur-3xl" />
        <div className="absolute -bottom-20 right-10 w-96 h-96 rounded-full bg-blue-500/25 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 rounded-[2rem] overflow-hidden border border-white/15 bg-white/10 backdrop-blur-2xl shadow-2xl"
      >
        <div className="hidden lg:flex flex-col justify-between p-10 text-white bg-gradient-to-br from-white/15 to-white/5">
          <div>
            <Link to="/" className="inline-flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center shadow-lg">
                <Sparkles className="w-5 h-5" />
              </div>
              <span className="text-xl font-semibold">Mooncci Blog</span>
            </Link>

            <h1 className="mt-16 text-5xl font-bold leading-tight">
              创建账号，
              <br />
              参与评论与创作。
            </h1>

            <p className="mt-6 text-white/70 leading-8 max-w-md">
              注册后可以参与文章评论；如需发布文章，可以在后台申请成为编辑。
            </p>
          </div>
        </div>

        <div className="bg-white/95 dark:bg-gray-950/95 p-8 md:p-12">
          <div className="mb-8">
            <Link to="/" className="text-sm text-blue-600 hover:underline">
              返回首页
            </Link>
            <h2 className="mt-5 text-3xl font-bold text-gray-900 dark:text-white">
              注册账号
            </h2>
            <p className="mt-2 text-gray-500">
              创建账号后即可登录并使用评论功能。
            </p>
          </div>

          {message && (
            <div className={`mb-5 rounded-2xl px-4 py-3 text-sm ${
              message.includes('成功')
                ? 'bg-blue-50 text-blue-700'
                : 'bg-red-50 text-red-600'
            }`}>
              {message}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                用户名
              </label>
              <div className="flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 focus-within:ring-2 focus-within:ring-blue-500">
                <User className="w-5 h-5 text-gray-400" />
                <input type="text" name="username" id="username" autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入用户名"
                  className="w-full bg-transparent outline-none text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                邮箱
              </label>
              <div className="flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 focus-within:ring-2 focus-within:ring-blue-500">
                <Mail className="w-5 h-5 text-gray-400" />
                <input type="email" name="email" id="email" autoComplete="email" inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-transparent outline-none text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                密码
              </label>
              <div className="flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 focus-within:ring-2 focus-within:ring-blue-500">
                <Lock className="w-5 h-5 text-gray-400" />
                <input type="password" name="password" id="new-password" autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 8 位，并包含字母和数字"
                  className="w-full bg-transparent outline-none text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                确认密码
              </label>
              <div className="flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 focus-within:ring-2 focus-within:ring-blue-500">
                <Lock className="w-5 h-5 text-gray-400" />
                <input type="password" name="confirmPassword" id="confirm-password" autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                 
                  placeholder="请再次输入密码"
                  className="w-full bg-transparent outline-none text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <button
              disabled={loading}
              className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-3 text-white font-medium shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? '注册中...' : '注册'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          <div className="mt-8 text-center text-sm text-gray-500">
            已经有账号？
            <Link to="/login" className="ml-2 text-blue-600 hover:underline">
              去登录
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
