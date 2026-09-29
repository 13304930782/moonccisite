import { notify } from '../lib/feedback';
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
  if (role === 'admin')
    return '你当前是管理员账号，已经可以写文章和管理内容，不需要申请成为编辑。';
  if (role === 'editor') return '你当前已经是编辑账号，可以直接写文章。';
  return '投稿不需要编辑权限；如需参与后台内容维护，再提交编辑申请。';
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

      notify.success(res.message || '申请已提交，请等待管理员审核');
      setReason('');
    } catch (err: any) {
      setMessage(err.message || '申请提交失败'); notify.error(err.message || '申请提交失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="max-w-2xl">
      <div className="admin-overview-head">
        <p className="eyebrow">参与写作</p>
        <h1>申请成为编辑</h1>
        <p>{getRoleTip(user?.role)}</p>
      </div>
      <p className="muted text-sm">
        当前账户：{user?.username} · {getRoleName(user?.role)}
      </p>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      {!canWrite(user?.role) && <Link className="quiet-button mt-6" to="/account/submissions">去我的投稿，开始写作 →</Link>}
      {!canWrite(user?.role) && (
        <form onSubmit={submit} className="site-form mt-8">
          <label htmlFor="editor-reason">申请说明</label>
          <textarea
            id="editor-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={6}
            className="w-full mt-3"
            placeholder="介绍你希望分享的内容，以及申请成为编辑的原因。"
          />
          <button className="quiet-button mt-6" disabled={loading || !user}>
            {loading ? '提交中…' : '提交申请'}
          </button>
        </form>
      )}
    </section>
  );
}
