import { useAdminList } from '../lib/useAdminList';
import { AdminPagination } from '../components/AdminPagination';
import { ThemeSelect } from '../components/ThemeSelect';
import { useState } from 'react';
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
  hidden: 'bg-muted text-muted-foreground',
  deleted: 'bg-muted text-muted-foreground',
};

export default function AdminCommentsPage() {
  const [filters, setFilters] = useState({ status: 'pending', target: 'all', keyword: '' });
  const [keyword, setKeyword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useAdminList<any>('/admin/comments', filters);
  const comments = list.items;
  const loadComments = list.reload;
  const filter = (patch: Partial<typeof filters>) => { list.setPage(1); setFilters(f => ({ ...f, ...patch })); list.reload(); setMessage(''); };
  const search = () => filter({ keyword: keyword.trim() });

  const updateStatus = async (id: number, nextStatus: string) => {
    const confirmText =
      nextStatus === 'visible'
        ? '确定通过这条评论吗？通过后会尝试邮件通知用户。'
        : nextStatus === 'rejected'
          ? '确定驳回这条评论吗？驳回后会邮件通知用户。'
          : '确定更新这条评论状态吗？';

    if (!window.confirm(confirmText)) return;

    if (busy) return;
    setBusy(true);
    try {
      const res = await api(`/admin/comments/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });

      setMessage(res.message || '操作成功');
      loadComments();
    } catch (err: any) {
      setMessage(err.message || '操作失败');
    } finally { setBusy(false); }
  };

  return (
    <div className="admin-page">
      <div className="py-2">
        <div className="mb-8">
          <h1 className="admin-title">评论管理</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            新评论默认待审核。通过或驳回后，系统会尝试邮件通知评论用户，并显示发送结果。
          </p>
        </div>

        {message && (
          <div className="mb-5 rounded-[10px] bg-muted px-4 py-3 text-sm text-foreground">
            {message}
          </div>
        )}

        <fieldset disabled={busy} className="mb-6 flex flex-col md:flex-row gap-3">
          <ThemeSelect aria-label="筛选评论状态"
            value={filters.status}
            onValueChange={(status) => filter({ status })}
            className="rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="pending">待审核</option>
            <option value="visible">已通过</option>
            <option value="rejected">已驳回</option>
            <option value="hidden">已隐藏</option>
            <option value="deleted">已删除</option>
            <option value="all">全部</option>
          </ThemeSelect>

          <ThemeSelect aria-label="筛选评论来源" value={filters.target} onValueChange={target => filter({ target })}>
            <option value="all">全部内容</option><option value="post">文章评论</option><option value="update">近况评论</option>
          </ThemeSelect>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') search();
            }}
            placeholder="搜索评论、用户、邮箱、内容或 IP"
            className="flex-1 rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
          />

          <button
            onClick={search}
            className="rounded-[10px] bg-muted px-5 py-3 text-foreground hover:bg-muted"
          >
            搜索
          </button>
        </fieldset>
        <AdminPagination label="评论管理分页" page={list.page} total={list.total} disabled={list.loading || busy} onPage={list.setPage} />
        {list.error && <p role="alert">{list.error}</p>}
        {list.loading && <p role="status">正在加载评论…</p>}
        <div className="space-y-4">
          {!list.loading && !list.error && comments.length === 0 && (
            <div className="rounded-[10px] bg-muted px-5 py-8 text-center text-muted-foreground">
              暂无评论
            </div>
          )}

          {comments.map((item) => (
            <div key={item.id} className="rounded-[10px] border border-border bg-card p-5">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>#{item.id}</span>
                    <span>内容：{item.post_title}</span>
                    <span>用户：{item.author_name}</span>
                    <span>邮箱：{item.author_email}</span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className={`rounded-full px-3 py-1 ${statusClass[item.status] || 'bg-muted text-muted-foreground'}`}>
                      {statusText[item.status] || item.status}
                    </span>
                    <span>IP：{item.ip_address || item.ip_address_masked || '-'}</span>
                    <span>时间：{item.created_at?.slice(0, 19).replace('T', ' ')}</span>
                  </div>

                  <p className="mt-4 whitespace-pre-wrap rounded-[10px] bg-muted px-4 py-3 leading-7 text-foreground">
                    {item.content}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {item.status !== 'visible' && (
                    <button disabled={busy}
                      onClick={() => updateStatus(item.id, 'visible')}
                      className="rounded-full bg-green-600 px-4 py-2 text-sm text-foreground hover:bg-green-700"
                    >
                      通过
                    </button>
                  )}

                  {item.status !== 'rejected' && (
                    <button disabled={busy}
                      onClick={() => updateStatus(item.id, 'rejected')}
                      className="rounded-full bg-red-600 px-4 py-2 text-sm text-foreground hover:bg-red-700"
                    >
                      驳回
                    </button>
                  )}

                  {item.status !== 'hidden' && (
                    <button disabled={busy}
                      onClick={() => updateStatus(item.id, 'hidden')}
                      className="rounded-full bg-muted px-4 py-2 text-sm text-foreground hover:bg-muted"
                    >
                      隐藏
                    </button>
                  )}

                  {item.status !== 'deleted' && (
                    <button disabled={busy}
                      onClick={() => updateStatus(item.id, 'deleted')}
                      className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
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
