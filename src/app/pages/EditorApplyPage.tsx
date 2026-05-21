import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PenLine, Send, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const roleLabel: Record<string, string> = {
  owner: '站长',
  admin: '管理员',
  editor: '编辑',
  user: '普通用户',
};

function canWrite(role?: string) {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

function getRoleTip(role?: string) {
  if (role === 'owner') return '你当前是站长账号，已经拥有最高权限，不需要申请成为编辑。';
  if (role === 'admin') return '你当前是管理员账号，已经可以写文章和管理内容，不需要申请成为编辑。';
  if (role === 'editor') return '你当前已经是编辑账号，可以直接写文章。';
  return '你当前是普通用户，如需发布文章，可以提交编辑申请。';
}

function getRoleName(role?: string) {
  if (role === 'owner') return '站长';
  if (role === 'admin') return '管理员';
  if (role === 'editor') return '编辑';
  return '普通用户';
}

export default function EditorApplyPage() {
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMessage('');
  }, [user?.role]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (!user) {
      setMessage('请先登录后再提交申请');
      return;
    }

    if (canWrite(user.role)) {
      setMessage('你当前已经拥有写作权限，无需提交编辑申请。');
      return;
    }

    if (!reason.trim()) {
      setMessage('请简单说明你申请成为编辑的原因');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const res = await api('/applications', {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });

      setMessage(res.message || '申请已提交，请等待管理员审核');
      setReason('');
    } catch (err: any) {
      setMessage(err.message || '申请提交失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="rounded-[2rem] bg-white/85 backdrop-blur border border-white/50 p-8 shadow-xl">
        <Link to="/admin" className="text-sm text-blue-600 hover:underline">
          返回后台
        </Link>

        <div className="mt-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 text-white flex items-center justify-center shadow-lg">
            <PenLine className="w-7 h-7" />
          </div>

          <div>
            <h1 className="text-3xl font-bold text-gray-900">申请成为编辑</h1>
            <p className="mt-2 text-gray-500">
              普通用户提交申请后，通过审核即可发布文章。
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-blue-50 border border-blue-100 px-5 py-4 text-blue-800">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 mt-0.5" />
            <div className="space-y-1">
              <p>
                当前用户：
                <span className="font-semibold">{user?.username || '未登录'}</span>
              </p>
              <p>
                网站身份：
                <span className="font-semibold">{roleLabel[user?.role || 'user'] || '普通用户'}</span>
              </p>
              <p>{getRoleTip(user?.role)}</p>
            </div>
          </div>
        </div>

        {message && (
          <div className="mt-6 rounded-2xl bg-gray-50 px-5 py-4 text-sm text-gray-700">
            {message}
          </div>
        )}

        {!canWrite(user?.role) && (
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <label className="block mb-2 text-sm font-medium text-gray-700">
                申请说明
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={6}
                placeholder="可以简单说明你想发布哪些内容、为什么希望成为编辑……"
                className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              disabled={loading || !user}
              className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Send className="w-4 h-4" />
              {loading ? '提交中...' : '提交申请'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
