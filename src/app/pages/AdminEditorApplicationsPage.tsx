import { useI18n } from '../i18n';
import { notify } from '../lib/feedback';
import { useCallback, useEffect, useRef, useState } from 'react';

import {Link} from '../components/LocaleLink';
import { ThemeSelect } from '../components/ThemeSelect';
import { ArrowLeft } from 'lucide-react';
import '../../styles/editor-applications.css';
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
  const { t } = useI18n();
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
      if (version === requestVersion.current) { setApplications([]); setLoadError(err.message || t("m_93683bff05")); }
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
    setMessage('');
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

      notify.success(res.message || t("m_38de25e522"));
      setDecision(null);
      await loadApplications();
    } catch (err: any) {
      setMessage(err.message || t("m_0c3b4cf7aa")); notify.error(err.message || t("m_0c3b4cf7aa"));
    } finally {
      setReviewing(null);
    }
  };

  const approving = decision?.status === 'approved';

  return (
    <div className="admin-page editor-applications-page">
      <div className="admin-page-body">
        <Link to="/admin" className="editor-applications-back"><ArrowLeft size={16} aria-hidden="true"/>{t("m_280dc8a5a1")}</Link>

        <header className="editor-applications-heading">
          <h1 className="admin-title">{t("m_70dfdc8440")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("m_02ccd5a5ff")}</p>
        </header>

        <div className="editor-applications-filters">
        <ThemeSelect value={status} aria-label={t("m_9a94254a1d")} onValueChange={value=>{setStatus(value);setMessage('');}}>
          {tabs.map(([value, label]) => <option key={value} value={value} disabled={loading && status !== value}>{t(label)}</option>)}
        </ThemeSelect>
        </div>

        <section className="editor-applications-results" aria-label={t("m_70dfdc8440")} aria-busy={loading}>

        {message && !decision && <AdminNotice>{t(message || '')}</AdminNotice>}
        {loadError && <AdminError message={t(loadError || '')} onRetry={() => void loadApplications()} />}
        {loading && <AdminLoading label={t("m_43ffc731ff")} />}
        {!loading && !loadError && applications.length === 0 && (
          <div className="admin-empty-result"><AdminEmpty
            title={status === 'pending' ? t("m_610ab1a383") : t("m_1c5ebfa2ee")}
            hint={status === 'pending' ? t("m_df3e7f3dbe") : t("m_3b0df18b88")}
            action={status !== 'all' && <button type="button" className="quiet-button" onClick={() => setStatus('all')}>{t("m_421a425978")}</button>}
          /></div>
        )}

        <div className="space-y-4" aria-busy={loading}>
          {!loading && applications.map((item) => (
            <article key={item.id} className="admin-list-row" aria-label={t("m_b48b0159a0", {v0: item.id})}>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>#{item.id}</span>
                    <span className="admin-status-chip" data-status={item.status}>{t(statusText[item.status] || item.status)}</span>
                    <span>{t("m_1a78d1d501")}{item.username}</span>
                    <span>{t("m_144030382e")}{item.email}</span>
                    <span>{t("m_8e8ffdeea8")}{item.role}</span>
                  </div>

                  <div className="mt-1 text-sm text-muted-foreground">
                     {t("m_5729fc7b4b")}{item.created_at?.slice(0, 19).replace('T', ' ')}
                  </div>

                  <p className="mt-4 whitespace-pre-wrap leading-7 text-foreground">
                    {item.reason}
                  </p>

                  {item.review_note && (
                    <div className="mt-3 rounded-[10px] bg-muted px-4 py-3 text-sm text-muted-foreground">
                       {t("m_42328507f0")}{item.review_note}
                    </div>
                  )}
                </div>

                {item.status === 'pending' && (
                  <div className="admin-row-actions shrink-0">
                    <button type="button" data-tone="primary" disabled={reviewing !== null} onClick={() => open(item, 'approved')}
                      aria-label={t("m_6078612132", {v0: item.username})}>
                      {reviewing === item.id && approving ? t("m_d3d21191f3") : t("m_1e9f2561b7")}
                    </button>
                    <button type="button" data-tone="danger" disabled={reviewing !== null} onClick={() => open(item, 'rejected')}
                      aria-label={t("m_92866ea66d", {v0: item.username})}>
                      {reviewing === item.id && !approving ? t("m_d3d21191f3") : t("m_136de7a8c4")}
                    </button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
        </section>
      </div>

      <Dialog open={Boolean(decision)} onOpenChange={(next) => { if (!next && reviewing === null) setDecision(null); }}>
        <DialogContent className="admin-note-dialog">
          <DialogTitle>{approving ? t("m_30c9fa0a54") : t("m_22de0407f2")}</DialogTitle>
          <DialogDescription>
            {decision && t("m_bbf3faf386", {v0: approving ? t("m_da34836915") : t("m_4a71bcc4de"), v1: decision.application.username})}
          </DialogDescription>
          {message && <AdminNotice>{t(message)}</AdminNotice>}
          <label className="sr-only" htmlFor="review-note">{approving ? t("m_510dbecc56") : t("m_a31fe5934e")}</label>
          <textarea id="review-note" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)}
            placeholder={approving ? t("m_352ea4a7f8") : t("m_30b70fcc1e")} autoFocus />
          <div className="inline-actions">
            <button type="button" className="quiet-button" disabled={reviewing !== null} onClick={() => setDecision(null)}>{t("m_2cd0f3be87")}</button>
            <button type="button" className="neo-button neo-button-dark" disabled={reviewing !== null} onClick={() => void submit()}>
              {reviewing !== null ? t("m_18931020ad") : approving ? t("m_603c2f9a1c") : t("m_de45b8ac34")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
