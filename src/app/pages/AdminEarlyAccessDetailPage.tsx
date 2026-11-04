import { useI18n } from '../i18n';
import { notify } from '../lib/feedback';
import { confirmAction } from '../lib/confirmAction';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {Link} from '../components/LocaleLink';
import { ArrowLeft, Check, Mail, RotateCcw, Settings, X } from 'lucide-react';
import { api } from '../lib/api';

const labels: Record<string, string> = {
  student: '学生', teacher: '教师', developer: '开发者', creator: '创作者', enterprise: '企业用户', other: '其他',
  macbook: 'MacBook', imac: 'iMac', mac_mini: 'Mac mini', mac_studio: 'Mac Studio',
  prompt_management: 'Prompt 管理', ai_workflow: 'AI 工作流', desktop_widget: '桌面 Widget', menu_bar: '菜单栏工具', ai_assistant: 'AI 助手',
  pending: '待审核', approved: '已通过', rejected: '已拒绝',
};

function formatDate(value?: string) {
  return value ? value.slice(0, 19).replace('T', ' ') : '—';
}

export default function AdminEarlyAccessDetailPage() {
  const { t , formatDate} = useI18n();
  const { id } = useParams();
  const [application, setApplication] = useState<any>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [loadStatus,setLoadStatus]=useState(0);
  const [message, setMessage] = useState('');

  const load = () => {
    setLoading(true);
    api(`/admin/early-access/${id}`)
      .then((data) => {
        setApplication(data);
        setReviewNote(data.review_note || '');
      })
      .catch((error) => {setApplication(null);setLoadStatus(error.status||0);setMessage(error.message || t("m_9a5fdeb3d2"));})
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const action = async (endpoint: string, body: Record<string, unknown> = {}, confirmation?: string) => {
    if (confirmation && !(await confirmAction(confirmation))) return;
    setWorking(true);
    setMessage('');

    try {
      const response = await api(`/admin/early-access/${id}/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setMessage(response.message || t("m_c001c96a1d"));
      if (response.application) {
        setApplication(response.application);
        setReviewNote(response.application.review_note || '');
      } else {
        load();
      }
    } catch (error: any) {
      setMessage(error.message || t("m_b3b75bd055")); notify.error(error.message || t("m_b3b75bd055"));
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <div className="py-6 text-muted-foreground">{t("m_43ffc731ff")}</div>;
  if (!application) return <div className="py-6 text-muted-foreground" role="alert"><p>{t(message) || t("m_4bdae1ab85")}</p><div className="inline-actions"><Link className="quiet-button" to="/admin/early-access">{t("m_8c84012b55")}</Link>{![403,404].includes(loadStatus)&&<button onClick={load}>{t("m_b8784c8dd5")}</button>}</div></div>;

  const features = Array.isArray(application.desired_features) ? application.desired_features : [];

  return (
    <div>
      <Link to="/admin/early-access" className="neo-button bg-card"><ArrowLeft className="h-4 w-4" />{t("m_8c84012b55")}</Link>

      <div className="admin-page-body mt-7">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm font-medium">APPLICATION #{application.id}</span>
              <span className={`border border-border px-3 py-1 text-xs font-medium ${application.status === 'pending' ? 'bg-muted' : application.status === 'approved' ? 'bg-muted' : 'bg-card'}`}>
                {t(labels[application.status] || application.status)}
              </span>
            </div>
            <h1 className="admin-title">{application.name}</h1>
            <p className="mt-3 font-medium text-muted-foreground">{application.email}</p>
          </div>
          <div className="font-mono text-xs font-medium leading-6 text-muted-foreground">
             {t("m_72baad4a86")}{formatDate(application.created_at)}<br />
             {t("m_42e3df8bf4")}{formatDate(application.reviewed_at)}
          </div>
        </div>

        <div className="mt-9 grid gap-0 border border-border md:grid-cols-2">
          {[
            [t("m_6717afc1b7"), t(labels[application.occupation] || application.occupation)],
            [t("m_c68978537c"), t(labels[application.device] || application.device)],
            [t("m_afde0d2f67"), application.macos_version],
            [t("m_13f1d7c525"), application.reviewer_name || '—'],
          ].map(([label, value]) => (
            <div key={label} className="border-b border-border p-4 last:border-b-0 md:border-r md:[&:nth-child(even)]:border-r-0 md:[&:nth-last-child(-n+2)]:border-b-0">
              <div className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
              <div className="mt-2 font-medium">{value || '—'}</div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="border border-border bg-muted p-5">
            <h2 className="neo-heading text-2xl">{t("m_06d21b4a2b")}</h2>
            <p className="mt-4 whitespace-pre-wrap text-sm font-medium leading-7">{application.use_case}</p>
          </section>
          <section className="border border-border bg-muted p-5">
            <h2 className="neo-heading text-2xl">{t("m_7057047378")}</h2>
            <p className="mt-4 whitespace-pre-wrap text-sm font-medium leading-7">{application.reason}</p>
          </section>
        </div>

        <section className="mt-6 border border-border p-5">
          <h2 className="neo-heading text-2xl">{t("m_7d69fe8e74")}</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {features.map((feature: string) => <span key={feature} className="border border-border bg-card px-3 py-2 text-sm font-medium shadow-none">{t(labels[feature] || feature)}</span>)}
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="border border-border p-5">
            <div className="flex items-center gap-2 font-medium"><Mail className="h-4 w-4" />{t("m_bd6c700e13")}</div>
            <p className="mt-3 text-sm font-medium text-muted-foreground">{t("m_f80b6f70e0")}{formatDate(application.owner_notification_sent_at)}</p>
            {application.owner_notification_error && !application.owner_notification_sent_at && <p className="mt-2 text-sm font-medium text-red-700">{application.owner_notification_error}</p>}
            {!application.owner_notification_sent_at && (
              <button type="button" disabled={working} onClick={() => action('resend-owner-notification')} className="neo-button mt-4 bg-card"><RotateCcw className="h-4 w-4" />{t("m_83914c66fe")}</button>
            )}
          </div>
          <div className="border border-border p-5">
            <div className="flex items-center gap-2 font-medium"><Mail className="h-4 w-4" />{t("m_606ba4c27a")}</div>
            <p className="mt-3 text-sm font-medium text-muted-foreground">{t("m_f80b6f70e0")}{formatDate(application.approval_email_sent_at)}</p>
            {application.approval_email_error && !application.approval_email_sent_at && <p className="mt-2 text-sm font-medium text-red-700">{application.approval_email_error}</p>}
            {application.status === 'approved' && !application.approval_email_sent_at && (
              <button type="button" disabled={working} onClick={() => action('resend-approval-email')} className="neo-button mt-4 bg-muted"><RotateCcw className="h-4 w-4" />{t("m_a6ce943bd9")}</button>
            )}
          </div>
        </section>

        {message && <div role="status" className="mt-6 border border-border bg-muted px-4 py-3 font-medium shadow-none">{t(message || '')}</div>}

        {application.status === 'pending' ? (
          <section className="mt-8 border border-border bg-muted p-6 text-foreground">
            <label className="font-medium">
               {t("m_82e2ed84f9")} <textarea maxLength={2000} rows={4} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} className="neo-input mt-3 w-full px-4 py-3 text-foreground outline-none" />
            </label>
            <div className="mt-6 flex flex-wrap gap-4">
              <button
                type="button"
                disabled={working}
                onClick={() => action('approve', { reviewNote }, t("m_c58c4101f2"))}
                className="neo-button neo-button-yellow disabled:opacity-50"
              >
                <Check className="h-4 w-4" />{t("m_eeb2d4bf57")} </button>
              <button
                type="button"
                disabled={working}
                onClick={() => action('reject', { reviewNote }, t("m_d53c225400"))}
                className="neo-button bg-card text-foreground disabled:opacity-50"
              >
                <X className="h-4 w-4" />{t("m_a9a6676732")} </button>
              <Link to="/admin/mail-settings" className="neo-button border-border bg-muted text-foreground shadow-none">
                <Settings className="h-4 w-4" />{t("m_241c34e811")} </Link>
            </div>
          </section>
        ) : application.review_note ? (
          <section className="mt-8 border border-border bg-muted p-5">
            <h2 className="font-medium">{t("m_969e89fe0f")}</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm font-medium leading-7">{application.review_note}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
