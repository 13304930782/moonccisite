import { notify } from '../lib/feedback';
import { confirmAction } from '../lib/confirmAction';
import { useAdminList } from '../lib/useAdminList';
import { AdminPagination } from '../components/AdminPagination';
import { AdminEmpty, AdminError, AdminLoading, AdminNotice } from '../components/admin/AdminState';
import { ThemeSelect } from '../components/ThemeSelect';
import { FormEvent, useState } from 'react';
import { api } from '../lib/api';
import { formatCommentTime } from '../lib/commentTime';

const statusText: Record<string, string> = {
  pending: '待审核',
  visible: '已通过',
  rejected: '已驳回',
  hidden: '已隐藏',
  deleted: '已删除',
};

const DEFAULT_FILTERS = { status: 'pending', target: 'all', keyword: '' };

const confirmCopy: Record<string, { text: string; label: string }> = {
  visible: { text: '确定通过这条评论吗？通过后会尝试邮件通知用户。', label: '通过评论' },
  rejected: { text: '确定驳回这条评论吗？驳回后会邮件通知用户。', label: '驳回评论' },
  hidden: { text: '确定隐藏这条评论吗？隐藏后访客将看不到它，之后仍可重新通过。', label: '隐藏评论' },
  deleted: { text: '确定删除这条评论吗？', label: '删除评论' },
};

export default function AdminCommentsPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [keyword, setKeyword] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const busy = busyId !== null;
  const list = useAdminList<any>('/admin/comments', filters);
  const comments = list.items;

  // A changed filter already changes the query; only reload when nothing changed so
  // "search again" still refreshes without sending the request twice.
  const filter = (patch: Partial<typeof filters>) => {
    const next = { ...filters, ...patch };
    setMessage('');
    if (next.status === filters.status && next.target === filters.target && next.keyword === filters.keyword) {
      list.reload();
      return;
    }
    list.setPage(1);
    setFilters(next);
  };
  const search = (event: FormEvent) => { event.preventDefault(); filter({ keyword: keyword.trim() }); };
  const filtered = filters.status !== DEFAULT_FILTERS.status || filters.target !== 'all' || Boolean(filters.keyword);
  const reset = () => { setKeyword(''); filter({ keyword: '', target: 'all', status: 'all' }); };

  const updateStatus = async (id: number, nextStatus: string) => {
    if (busy) return;
    const copy = confirmCopy[nextStatus] || { text: '确定更新这条评论状态吗？', label: '确认继续' };
    if (!(await confirmAction(copy.text, copy.label))) return;

    setBusyId(id);
    setMessage('');
    try {
      const res = await api(`/admin/comments/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });

      notify.success(res.message || '操作成功');
      list.reload();
    } catch (err: any) {
      setMessage(err.message || '操作失败'); notify.error(err.message || '操作失败');
    } finally { setBusyId(null); }
  };

  const action = (item: any, status: string, label: string, tone?: 'primary' | 'danger') =>
    item.status !== status && (
      <button type="button" data-tone={tone} disabled={busy} onClick={() => updateStatus(item.id, status)}
        aria-label={`${label}评论 #${item.id}`}>
        {busyId === item.id ? '处理中…' : label}
      </button>
    );

  return (
    <div className="admin-page">
      <div className="py-2">
        <div className="mb-8">
          <h1 className="admin-title">评论管理</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            新评论默认待审核。通过或驳回后，系统会尝试邮件通知评论用户，并显示发送结果。
          </p>
        </div>

        {message && <AdminNotice>{message}</AdminNotice>}

        <form role="search" onSubmit={search} className="mb-6">
          <fieldset disabled={busy} className="flex flex-col md:flex-row gap-3">
            <ThemeSelect aria-label="筛选评论状态" value={filters.status} onValueChange={(status) => filter({ status })}>
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
              type="search"
              aria-label="搜索评论、用户、邮箱、内容或 IP"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索评论、用户、邮箱、内容或 IP"
              className="flex-1 min-h-11 rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
            />
            <button type="submit" className="neo-button">搜索</button>
          </fieldset>
        </form>

        <AdminPagination label="评论管理分页" page={list.page} total={list.total} disabled={list.loading || busy} onPage={list.setPage} />
        {list.error && <AdminError message={list.error} onRetry={list.reload} />}
        {list.loading && <AdminLoading label="正在加载评论…" />}
        <div className="space-y-4">
          {!list.loading && !list.error && comments.length === 0 && (
            <AdminEmpty
              title={filtered ? '没有符合条件的评论' : '暂无待审核评论'}
              hint={filtered ? '换个筛选条件，或清除筛选查看全部评论。' : '新评论提交后会出现在这里。'}
              action={filtered && <button type="button" className="quiet-button" onClick={reset}>清除筛选，查看全部评论</button>}
            />
          )}

          {comments.map((item) => (
            <article key={item.id} className="rounded-[10px] border border-border bg-card p-5" aria-label={`评论 #${item.id}`}>
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>#{item.id}</span>
                    <span>内容：{item.post_title}</span>
                    <span>用户：{item.author_name}</span>
                    <span>邮箱：{item.author_email}</span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="admin-status-chip" data-status={item.status}>{statusText[item.status] || item.status}</span>
                    <span>IP：{item.ip_address || item.ip_address_masked || '-'}</span>
                    <span>时间：{formatCommentTime(item.created_at, true)}（北京时间）</span>
                  </div>

                  <p className="mt-4 whitespace-pre-wrap rounded-[10px] bg-muted px-4 py-3 leading-7 text-foreground">
                    {item.content}
                  </p>
                </div>

                <div className="admin-row-actions shrink-0">
                  {action(item, 'visible', '通过', 'primary')}
                  {action(item, 'rejected', '驳回')}
                  {action(item, 'hidden', '隐藏')}
                  {action(item, 'deleted', '删除', 'danger')}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
