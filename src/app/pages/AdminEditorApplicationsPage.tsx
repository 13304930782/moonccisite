import { notify } from '../lib/feedback';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { AdminEmpty, AdminError, AdminLoading, AdminNotice } from '../components/admin/AdminState';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';

type Application = {
  id: number; username: string; email: string; role: string; status: 'pending' | 'approved' | 'rejected';
  reason: string; review_note?: string; created_at?: string;
};
type Decision = { application: Application; status: 'approved' | 'rejected' };

const statusText: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
};
const tabs = [['all', '全部'], ['pending', '待审核'], ['approved', '已通过'], ['rejected', '已拒绝']] as const;

export default function AdminEditorApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [status, setStatus] = useState<string>('pending');
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState('');
  const requestVersion = useRef(0);

  const loadApplications = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setLoadError('');
    try {
      const data = await api(`/admin/editor-applications?status=${status}`);
      if (version === requestVersion.current) setApplications(data);
    } catch (err: any) {
      if (version === requestVersion.current) { setApplications([]); setLoadError(err.message || '申请加载失败'); }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  const open = (application: Application, next: 'approved' | 'rejected') => {
    if (reviewing !== null) return;
    setNote('');
    setDecision({ application, status: next });
  };

  // The decision is made in an accessible dialog instead of a browser prompt, so the
  // note can be reviewed, left empty on purpose, or cancelled without losing context.
  const submit = async () => {
    if (!decision || reviewing !== null) return;
    const { application, status: nextStatus } = decision;
    setReviewing(application.id);
    setMessage('');

    try {
      const res = await api(`/admin/editor-applications/${application.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus, review_note: note.trim() }),
      });

      notify.success(res.message || '操作成功');
      setDecision(null);
      await loadApplications();
    } catch (err: any) {
      setMessage(err.message || '操作失败'); notify.error(err.message || '操作失败');
    } finally {
      setReviewing(null);
    }
  };

  const approving = decision?.status === 'approved';

  return (
    <div className="admin-page">
      <div className="admin-page-body">
        <Link to="/admin" className="text-sm text-foreground hover:underline">返回后台</Link>

        <div className="mt-2 mb-2">
          <h1 className="admin-title">编辑申请审核</h1>
          <p className="mt-2 text-sm text-muted-foreground">审核普通用户的写文章权限申请。</p>
        </div>

        <div className="admin-filter-chips" role="group" aria-label="筛选编辑申请状态">
          {tabs.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={status === value} disabled={loading && status !== value}
              onClick={() => { setStatus(value); setMessage(''); }}>{label}</button>
          ))}
        </div>

        {message && <AdminNotice>{message}</AdminNotice>}
        {loadError && <AdminError message={loadError} onRetry={() => void loadApplications()} />}
        {loading && <AdminLoading label="正在加载申请…" />}
        {!loading && !loadError && applications.length === 0 && (
          <AdminEmpty
            title={status === 'pending' ? '没有待审核的申请' : '暂无申请'}
            hint={status === 'pending' ? '新的编辑申请提交后会出现在这里。' : '换一个状态查看其他申请。'}
            action={status !== 'all' && <button type="button" className="quiet-button" onClick={() => setStatus('all')}>查看全部申请</button>}
          />
        )}

        <div className="space-y-4" aria-busy={loading}>
          {!loading && applications.map((item) => (
            <article key={item.id} className="admin-list-row" aria-label={`申请 #${item.id}`}>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>#{item.id}</span>
                    <span className="admin-status-chip" data-status={item.status}>{statusText[item.status] || item.status}</span>
                    <span>用户：{item.username}</span>
                    <span>邮箱：{item.email}</span>
                    <span>当前角色：{item.role}</span>
                  </div>

                  <div className="mt-1 text-sm text-muted-foreground">
                    申请时间：{item.created_at?.slice(0, 19).replace('T', ' ')}
                  </div>

                  <p className="mt-4 whitespace-pre-wrap leading-7 text-foreground">
                    {item.reason}
                  </p>

                  {item.review_note && (
                    <div className="mt-3 rounded-[10px] bg-muted px-4 py-3 text-sm text-muted-foreground">
                      审核备注：{item.review_note}
                    </div>
                  )}
                </div>

                {item.status === 'pending' && (
                  <div className="admin-row-actions shrink-0">
                    <button type="button" data-tone="primary" disabled={reviewing !== null} onClick={() => open(item, 'approved')}
                      aria-label={`通过 ${item.username} 的申请`}>
                      {reviewing === item.id && approving ? '处理中…' : '通过'}
                    </button>
                    <button type="button" data-tone="danger" disabled={reviewing !== null} onClick={() => open(item, 'rejected')}
                      aria-label={`拒绝 ${item.username} 的申请`}>
                      {reviewing === item.id && !approving ? '处理中…' : '拒绝'}
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      <Dialog open={Boolean(decision)} onOpenChange={(next) => { if (!next && reviewing === null) setDecision(null); }}>
        <DialogContent className="admin-note-dialog">
          <DialogTitle>{approving ? '通过编辑申请' : '拒绝编辑申请'}</DialogTitle>
          <DialogDescription>
            {decision && `${approving ? '通过后' : '拒绝后'}会通知 ${decision.application.username}。备注会一并记录，可以留空。`}
          </DialogDescription>
          <label className="sr-only" htmlFor="review-note">{approving ? '通过备注（可选）' : '拒绝理由（可选）'}</label>
          <textarea id="review-note" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)}
            placeholder={approving ? '通过备注，可留空' : '拒绝理由，可留空'} autoFocus />
          <div className="inline-actions">
            <button type="button" className="quiet-button" disabled={reviewing !== null} onClick={() => setDecision(null)}>取消</button>
            <button type="button" className="neo-button neo-button-dark" disabled={reviewing !== null} onClick={() => void submit()}>
              {reviewing !== null ? '提交中…' : approving ? '确认通过' : '确认拒绝'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
