import { useI18n } from '../i18n';
import { notify } from '../lib/feedback';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { RefreshCw } from 'lucide-react';
import { AdminButton } from '../components/admin/AdminButton';
import { api } from '../lib/api';
import { confirmAction } from '../lib/confirmAction';
import { useUnsavedLeave } from '../lib/useUnsavedLeave';
import { AdminEmpty, AdminError, AdminLoading, AdminNotice } from '../components/admin/AdminState';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import '../../styles/admin-ui-v2.css';
import '../../styles/editor-applications.css';

type Application = {
  id: number; username: string; email: string; role: string; status: 'pending' | 'approved' | 'rejected';
  reason: string; review_note?: string; created_at?: string;
};
type Decision = { application: Application; status: 'approved' | 'rejected' };
const statusText: Record<string, string> = { pending: '待审核', approved: '已通过', rejected: '已拒绝' };
const roleText: Record<string, string> = { owner: '站长', admin: '管理员', editor: '编辑', teacher: '教师', user: '普通用户' };
const tabs = [['all', '全部'], ['pending', '待审核'], ['approved', '已通过'], ['rejected', '已拒绝']] as const;

export default function AdminEditorApplicationsPage() {
  const { t, locale } = useI18n();
  const [applications, setApplications] = useState<Application[]>([]);
  const [status, setStatus] = useState<string>('pending');
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [note, setNote] = useState('');
  const requestVersion = useRef(0), pending = useRef(false), closing = useRef(false), filters = useRef<HTMLDivElement>(null);
  useUnsavedLeave(reviewOpen && !!note.trim());
  useEffect(() => {filters.current?.querySelector('[aria-pressed=true]')?.scrollIntoView({block:'nearest',inline:'center',behavior:'auto'});},[status,locale]);

  const loadApplications = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setLoadError('');
    try {
      const data = await api(`/admin/editor-applications?status=${status}`);
      if (version === requestVersion.current) setApplications(data);
    } catch (err: any) {
      if (version === requestVersion.current) { setApplications([]); setLoadError(err.message || t('m_93683bff05')); }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [status]);
  useEffect(() => { void loadApplications(); return () => { requestVersion.current++; }; }, [loadApplications]);
  const open = (application: Application, next: 'approved' | 'rejected') => {
    if (pending.current) return;
    setNote(''); setMessage(''); setDecision({ application, status: next }); setReviewOpen(true);
  };
  const close = async () => {
    if (pending.current || closing.current) return;
    closing.current = true;
    try { if (!note.trim() || await confirmAction(t('m_d87119f6cc'))) setReviewOpen(false); }
    finally { closing.current = false; }
  };
  const submit = async () => {
    if (!reviewOpen || !decision || pending.current || closing.current) return;
    const { application, status: nextStatus } = decision;
    pending.current = true; setReviewing(application.id); setMessage('');
    try {
      const res = await api(`/admin/editor-applications/${application.id}`, { method: 'PUT', body: JSON.stringify({ status: nextStatus, review_note: note.trim() }) });
      notify.success(res.message || t('m_38de25e522'));
      setReviewOpen(false); await loadApplications();
    } catch (err: any) { setMessage(err.message || t('m_0c3b4cf7aa')); }
    finally { pending.current = false; setReviewing(null); }
  };
  const approving = decision?.status === 'approved';
  return <div className="admin-page editor-applications-page ui-v2">
    <header className="editor-applications-heading"><div><h1 className="admin-title">{t('m_70dfdc8440')}</h1><p>{t('m_02ccd5a5ff')}</p></div><AdminButton type="button" variant="soft" disabled={loading} onClick={() => void loadApplications()}><RefreshCw size={16} aria-hidden="true"/>{t('刷新')}</AdminButton></header>
    <div className="editor-applications-toolbar"><div className="editor-applications-filter-scroll"><div ref={filters} className="editor-applications-filters" role="group" aria-label={t('m_9a94254a1d')} style={{'--application-tab':tabs.findIndex(([value]) => value===status)} as CSSProperties}>{tabs.map(([value,label]) => <button key={value} type="button" aria-pressed={status===value} onClick={() => {setStatus(value);setMessage('');}}>{t(label)}</button>)}</div></div><span className="editor-applications-count" role="status">{!loading && !loadError ? t('共 {count} 项',{count:applications.length}) : ''}</span></div>
    <section className="editor-applications-results" aria-label={t('m_70dfdc8440')} aria-busy={loading}>
      {message && !reviewOpen && <AdminNotice>{t(message)}</AdminNotice>}
      {loadError && <AdminError message={t(loadError)} onRetry={() => void loadApplications()}/>}
      {loading && <AdminLoading label={t('m_43ffc731ff')}/>}
      {!loading && !loadError && applications.length===0 && <div className="admin-empty-result"><AdminEmpty title={status==='pending'?t('m_610ab1a383'):t('m_1c5ebfa2ee')} hint={status==='pending'?t('m_df3e7f3dbe'):t('m_3b0df18b88')} action={status!=='all' && <AdminButton variant="soft" type="button" onClick={() => setStatus('all')}>{t('m_421a425978')}</AdminButton>}/></div>}
      {!loading && applications.map(item => <article key={item.id} className="editor-application-row" aria-label={t('m_b48b0159a0',{v0:item.id})}>
        <header className="editor-application-header"><div><h2>{item.username}<small>#{item.id}</small></h2><p>{item.email}</p></div><span className="admin-status-chip" data-status={item.status}>{t(statusText[item.status]||item.status)}</span></header>
        <div className="editor-application-meta"><span>{t(roleText[item.role]||item.role)}</span>{item.created_at && <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString(locale,{timeZone:'Asia/Shanghai'})}</time>}</div>
        <section className="editor-application-reason"><h3>{t('m_c033e6eeed')}</h3><p>{item.reason}</p></section>
        {item.review_note && <div className="editor-application-note"><span>{t('m_42328507f0')}</span><p>{item.review_note}</p></div>}
        {item.status==='pending' && <div className="admin-row-actions editor-application-actions"><AdminButton type="button" disabled={reviewing!==null} onClick={() => open(item,'approved')} aria-label={t('m_6078612132',{v0:item.username})}>{reviewing===item.id && approving?t('m_d3d21191f3'):t('m_1e9f2561b7')}</AdminButton><AdminButton type="button" variant="soft" className="ui-btn--danger" disabled={reviewing!==null} onClick={() => open(item,'rejected')} aria-label={t('m_92866ea66d',{v0:item.username})}>{reviewing===item.id && !approving?t('m_d3d21191f3'):t('m_136de7a8c4')}</AdminButton></div>}
      </article>)}
    </section>
    <Dialog open={reviewOpen} onOpenChange={next => {if(!next)void close();}}><DialogContent className="admin-note-dialog editor-review-dialog ui-v2" aria-busy={reviewing!==null}>
      <header><DialogTitle>{approving?t('m_30c9fa0a54'):t('m_22de0407f2')}</DialogTitle><DialogDescription>{decision && t('m_bbf3faf386',{v0:approving?t('m_da34836915'):t('m_4a71bcc4de'),v1:decision.application.username})}</DialogDescription></header>
      {decision && <div className="editor-review-applicant"><strong>{decision.application.username}</strong><span>{decision.application.email}</span><p>{decision.application.reason}</p></div>}
      {message && <AdminNotice>{t(message)}</AdminNotice>}
      <label className="editor-review-note-label" htmlFor="review-note"><span>{approving?t('m_510dbecc56'):t('m_a31fe5934e')}</span><small>{note.length}/500</small></label>
      <textarea id="review-note" disabled={reviewing!==null} value={note} maxLength={500} onChange={event => setNote(event.target.value)} placeholder={approving?t('m_352ea4a7f8'):t('m_30b70fcc1e')}/>
      <div className="inline-actions"><AdminButton type="button" variant="soft" data-dialog-cancel disabled={reviewing!==null} onClick={() => void close()}>{t('m_2cd0f3be87')}</AdminButton><AdminButton type="button" className={approving?'':'ui-btn--danger'} variant={approving?'solid':'soft'} disabled={reviewing!==null} onClick={() => void submit()}>{reviewing!==null?t('m_18931020ad'):approving?t('m_603c2f9a1c'):t('m_de45b8ac34')}</AdminButton></div>
    </DialogContent></Dialog>
  </div>;
}
