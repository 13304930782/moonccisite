import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const statusText: Record<string, string> = {
  pending: '待审核',
  visible: '已通过',
  rejected: '已驳回',
  hidden: '已隐藏',
  deleted: '已删除',
};

const statusClass: Record<string, string> = {
  pending: 'bg-yellow-50 text-yellow-700',
  visible: 'bg-green-50 text-green-700',
  rejected: 'bg-red-50 text-red-700',
  hidden: 'bg-gray-100 text-gray-600',
  deleted: 'bg-gray-200 text-gray-500',
};

export default function AdminCommentsPage() {
  const [comments, setComments] = useState<any[]>([]);
  const [status, setStatus] = useState('pending');
  const [keyword, setKeyword] = useState('');
  const [message, setMessage] = useState('');

  const loadComments = () => {
    const q = new URLSearchParams();

    if (status) q.set('status', status);
    if (keyword.trim()) q.set('keyword', keyword.trim());

    api(`/admin/comments?${q.toString()}`)
      .then(setComments)
      .catch((err) => setMessage(err.message || '评论加载失败'));
  };

  useEffect(() => {
    loadComments();
  }, [status]);

  const updateStatus = async (id: number, nextStatus: string) => {
    const confirmText =
      nextStatus === 'visible'
        ? '确定通过这条评论吗？通过后会邮件通知用户。'
        : nextStatus === 'rejected'
          ? '确定驳回这条评论吗？驳回后会邮件通知用户。'
          : '确定更新这条评论状态吗？';

    if (!window.confirm(confirmText)) return;

    try {
      const res = await api(`/admin/comments/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });

      setMessage(res.message || '操作成功');
      loadComments();
    } catch (err: any) {
      setMessage(err.message || '操作失败');
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="rounded-[2rem] bg-white/85 backdrop-blur border border-white/50 p-8 shadow-xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">评论管理</h1>
          <p className="mt-2 text-sm text-gray-500">
            新评论默认待审核。通过或驳回后，系统会邮件通知评论用户。
          </p>
        </div>

        {message && (
          <div className="mb-5 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
            {message}
          </div>
        )}

        <div className="mb-6 flex flex-col md:flex-row gap-3">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="pending">待审核</option>
            <option value="visible">已通过</option>
            <option value="rejected">已驳回</option>
            <option value="hidden">已隐藏</option>
            <option value="deleted">已删除</option>
            <option value="all">全部</option>
          </select>

          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') loadComments();
            }}
            placeholder="搜索评论、用户、邮箱、文章或 IP"
            className="flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            onClick={loadComments}
            className="rounded-2xl bg-gray-950 px-5 py-3 text-white hover:bg-gray-800"
          >
            搜索
          </button>
        </div>

        <div className="space-y-4">
          {comments.length === 0 && (
            <div className="rounded-2xl bg-gray-50 px-5 py-8 text-center text-gray-500">
              暂无评论
            </div>
          )}

          {comments.map((item) => (
            <div key={item.id} className="rounded-3xl border border-gray-200 bg-white/75 p-5">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                    <span>#{item.id}</span>
                    <span>文章：{item.post_title}</span>
                    <span>用户：{item.author_name}</span>
                    <span>邮箱：{item.author_email}</span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className={`rounded-full px-3 py-1 ${statusClass[item.status] || 'bg-gray-100 text-gray-600'}`}>
                      {statusText[item.status] || item.status}
                    </span>
                    <span>IP：{item.ip_address || '-'}</span>
                    <span>时间：{item.created_at?.slice(0, 19).replace('T', ' ')}</span>
                  </div>

                  <p className="mt-4 whitespace-pre-wrap rounded-2xl bg-gray-50 px-4 py-3 leading-7 text-gray-800">
                    {item.content}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {item.status !== 'visible' && (
                    <button
                      onClick={() => updateStatus(item.id, 'visible')}
                      className="rounded-full bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700"
                    >
                      通过
                    </button>
                  )}

                  {item.status !== 'rejected' && (
                    <button
                      onClick={() => updateStatus(item.id, 'rejected')}
                      className="rounded-full bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
                    >
                      驳回
                    </button>
                  )}

                  {item.status !== 'hidden' && (
                    <button
                      onClick={() => updateStatus(item.id, 'hidden')}
                      className="rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
                    >
                      隐藏
                    </button>
                  )}

                  {item.status !== 'deleted' && (
                    <button
                      onClick={() => updateStatus(item.id, 'deleted')}
                      className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50"
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
