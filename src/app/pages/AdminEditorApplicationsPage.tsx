import { ThemeSelect } from '../components/ThemeSelect';
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
    <div className="admin-page">
      <div className="admin-page-body">
        <Link to="/admin" className="text-sm text-foreground hover:underline">返回后台</Link>

        <div className="mt-2 mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="admin-title">编辑申请审核</h1>
            <p className="mt-2 text-sm text-muted-foreground">审核普通用户的写文章权限申请。</p>
          </div>

          <ThemeSelect value={status} onValueChange={(nextValue) => setStatus(nextValue)} className="rounded-[6px] border px-4 py-2 bg-card">
            <option value="all">全部</option>
            <option value="pending">待审核</option>
            <option value="approved">已通过</option>
            <option value="rejected">已拒绝</option>
          </ThemeSelect>
        </div>

        {message && <div className="mb-4 rounded-[6px] bg-muted px-4 py-3 text-foreground">{message}</div>}

        <div className="space-y-4">
          {applications.length === 0 && <p className="text-muted-foreground">暂无申请。</p>}

          {applications.map((item) => (
            <div key={item.id} className="admin-list-row">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">
                    #{item.id} ｜ 用户：{item.username} ｜ 邮箱：{item.email} ｜ 当前角色：{item.role}
                  </div>

                  <div className="mt-1 text-sm text-muted-foreground">
                    状态：{statusText[item.status] || item.status} ｜ 申请时间：{item.created_at?.slice(0, 19).replace('T', ' ')}
                  </div>

                  <p className="mt-4 whitespace-pre-wrap leading-7 text-foreground">
                    {item.reason}
                  </p>

                  {item.review_note && (
                    <div className="mt-3 rounded-[6px] bg-muted px-4 py-3 text-sm text-muted-foreground">
                      审核备注：{item.review_note}
                    </div>
                  )}
                </div>

                {item.status === 'pending' && (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => review(item.id, 'approved')} className="rounded-full bg-muted px-4 py-2 text-sm text-foreground">
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
