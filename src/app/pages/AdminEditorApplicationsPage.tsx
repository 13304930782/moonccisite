import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function AdminEditorApplicationsPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [status, setStatus] = useState('all');
  const [message, setMessage] = useState('');

  const loadApplications = () => {
    api(`/admin/editor-applications?status=${status}`)
      .then(setApplications)
      .catch((err) => setMessage(err.message || '申请加载失败'));
  };

  useEffect(() => {
    loadApplications();
  }, [status]);

  const review = async (id: number, nextStatus: 'approved' | 'rejected') => {
    const note = window.prompt(nextStatus === 'approved' ? '通过备注，可留空' : '拒绝理由，可留空') || '';

    try {
      const res = await api(`/admin/editor-applications/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus, review_note: note }),
      });

      setMessage(res.message || '操作成功');
      loadApplications();
    } catch (err: any) {
      setMessage(err.message || '操作失败');
    }
  };

  const statusText: Record<string, string> = {
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 px-6 py-16">
      <div className="max-w-6xl mx-auto rounded-3xl bg-white/80 backdrop-blur border border-white/40 p-8 shadow-xl">
        <Link to="/admin" className="text-sm text-blue-600 hover:underline">返回后台</Link>

        <div className="mt-2 mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">编辑申请审核</h1>
            <p className="mt-2 text-sm text-gray-500">审核普通用户的写文章权限申请。</p>
          </div>

          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border px-4 py-2 bg-white">
            <option value="all">全部</option>
            <option value="pending">待审核</option>
            <option value="approved">已通过</option>
            <option value="rejected">已拒绝</option>
          </select>
        </div>

        {message && <div className="mb-4 rounded-xl bg-blue-50 px-4 py-3 text-blue-700">{message}</div>}

        <div className="space-y-4">
          {applications.length === 0 && <p className="text-gray-500">暂无申请。</p>}

          {applications.map((item) => (
            <div key={item.id} className="rounded-2xl border border-gray-200 bg-white/70 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm text-gray-500">
                    #{item.id} ｜ 用户：{item.username} ｜ 邮箱：{item.email} ｜ 当前角色：{item.role}
                  </div>

                  <div className="mt-1 text-sm text-gray-500">
                    状态：{statusText[item.status] || item.status} ｜ 申请时间：{item.created_at?.slice(0, 19).replace('T', ' ')}
                  </div>

                  <p className="mt-4 whitespace-pre-wrap leading-7 text-gray-800">
                    {item.reason}
                  </p>

                  {item.review_note && (
                    <div className="mt-3 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                      审核备注：{item.review_note}
                    </div>
                  )}
                </div>

                {item.status === 'pending' && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => review(item.id, 'approved')} className="rounded-full bg-blue-600 px-4 py-2 text-sm text-white">
                      通过
                    </button>
                    <button onClick={() => review(item.id, 'rejected')} className="rounded-full border border-red-200 px-4 py-2 text-sm text-red-600">
                      拒绝
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
