import { useI18n } from '../i18n';
import { useContentListQuery } from '../lib/useContentListQuery';
import { notify } from '../lib/feedback';
import { confirmAction } from '../lib/confirmAction';
import { useAdminList } from '../lib/useAdminList';
import { AdminPagination } from '../components/AdminPagination';
import { AdminEmpty, AdminError, AdminLoading, AdminNotice } from '../components/admin/AdminState';
import { ThemeSelect } from '../components/ThemeSelect';
import { FormEvent, useEffect, useState } from 'react';
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
  const { t } = useI18n();
  const query = useContentListQuery();
  const filters = {
    status: [...Object.keys(statusText), 'all'].includes(query.params.get('status') || '') ? query.params.get('status')! : DEFAULT_FILTERS.status,
    target: ['post', 'update'].includes(query.params.get('target') || '') ? query.params.get('target')! : 'all',
    keyword: query.params.get('keyword') || '',
  };
  const [keyword, setKeyword] = useState(filters.keyword);
  useEffect(() => { setKeyword(filters.keyword); }, [filters.keyword]);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const busy = busyId !== null;
  const list = useAdminList<any>('/admin/comments', filters, query);
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
    query.update({ ...next, page: '' });
  };
  const search = (event: FormEvent) => { event.preventDefault(); filter({ keyword: keyword.trim() }); };
  const filtered = !['pending', 'all'].includes(filters.status) || filters.target !== 'all' || Boolean(filters.keyword);
  const reset = () => { setKeyword(''); filter({ keyword: '', target: 'all', status: 'all' }); };

  const updateStatus = async (id: number, nextStatus: string) => {
    if (busy) return;
    const copy = confirmCopy[nextStatus] || { text: t("m_430b3af662"), label: t("m_b9ce222cc9") };
    if (!(await confirmAction(t(copy.text), t(copy.label)))) return;

    setBusyId(id);
    setMessage('');
    try {
      const res = await api(`/admin/comments/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus }),
      });

      notify.success(res.message || t("m_38de25e522"));
      list.reload();
    } catch (err: any) {
      setMessage(err.message || t("m_0c3b4cf7aa"));
    } finally { setBusyId(null); }
  };

  const action = (item: any, status: string, label: string, tone?: 'primary' | 'danger') =>
    item.status !== status && (
      <button type="button" data-tone={tone} disabled={busy} onClick={() => updateStatus(item.id, status)}
        aria-label={t("m_2121cf994d", {v0: label, v1: item.id})}>
        {busyId === item.id ? t("m_d3d21191f3") : label}
      </button>
    );

  return (
    <div className="admin-page">
      <div className="py-2">
        <div className="mb-8">
          <h1 className="admin-title">{t("m_e7c87ea7ef")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
             {t("m_8a18e3c189")} </p>
        </div>

        {message && <AdminNotice>{t(message || '')}</AdminNotice>}

        <form role="search" onSubmit={search} className="mb-6">
          <fieldset disabled={busy} className="flex flex-col md:flex-row gap-3">
            <ThemeSelect aria-label={t("m_7aa200337d")} value={filters.status} onValueChange={(status) => filter({ status })}>
              <option value="pending">{t("m_7bf25421c6")}</option>
              <option value="visible">{t("m_3fa9b68490")}</option>
              <option value="rejected">{t("m_4dbcdec869")}</option>
              <option value="hidden">{t("m_1f1bc0d510")}</option>
              <option value="deleted">{t("m_077a6d3771")}</option>
              <option value="all">{t("m_5c55a67935")}</option>
            </ThemeSelect>

            <ThemeSelect aria-label={t("m_148391759c")} value={filters.target} onValueChange={target => filter({ target })}>
              <option value="all">{t("m_2edce57be5")}</option><option value="post">{t("m_c31c3c5290")}</option><option value="update">{t("m_eefaeb272a")}</option>
            </ThemeSelect>
            <input
              type="search"
              aria-label={t("m_283569513f")}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={t("m_283569513f")}
              className="flex-1 min-h-11 rounded-[10px] border border-border bg-card px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
            />
            <button type="submit" className="neo-button">{t("m_44ce7ae909")}</button>
          </fieldset>
        </form>

        {list.total > 0 && !list.error && <AdminPagination label={t("m_1873748f2d")} page={list.page} total={list.total} disabled={list.loading || busy} onPage={list.setPage} />}
        {list.error && <AdminError message={list.error} onRetry={list.reload} />}
        {list.loading && <AdminLoading label={t("m_dded3fba07")} />}
        <div className={`space-y-4${!list.loading && !list.error && comments.length === 0 ? ' admin-comments-empty-result' : ''}`}>
          {!list.loading && !list.error && comments.length === 0 && (
            <AdminEmpty
              title={filtered ? t("m_22e493a265") : t(filters.status === 'pending' ? "m_22f1e097af" : "m_fd4c868608")}
              hint={filtered ? t("m_7b6ed0e2ba") : t("m_acac5af46e")}
              action={filtered && <button type="button" className="quiet-button" onClick={reset}>{t("m_e9b772cc34")}</button>}
            />
          )}

          {comments.map((item) => (
            <article key={item.id} className="rounded-[10px] border border-border bg-card p-5" aria-label={t("m_928e4faf8d", {v0: item.id})}>
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>#{item.id}</span>
                    <span>{t("m_377416bd80")}{item.post_title}</span>
                    <span>{t("m_1a78d1d501")}{item.author_name}</span>
                    <span>{t("m_144030382e")}{item.author_email}</span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="admin-status-chip" data-status={item.status}>{t(statusText[item.status] || item.status)}</span>
                    <span>IP：{item.ip_address || item.ip_address_masked || '-'}</span>
                    <span>{t("m_2bfff95804")}{formatCommentTime(item.created_at, true)}{t("m_5eb76ad884")}</span>
                  </div>

                  <p className="mt-4 whitespace-pre-wrap rounded-[10px] bg-muted px-4 py-3 leading-7 text-foreground">
                    {item.content}
                  </p>
                </div>

                <div className="admin-row-actions shrink-0">
                  {action(item, 'visible', t("m_1e9f2561b7"), 'primary')}
                  {action(item, 'rejected', t("m_089e6ed3f5"))}
                  {action(item, 'hidden', t("m_145219e726"))}
                  {action(item, 'deleted', t("m_2f9daa8289"), 'danger')}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
