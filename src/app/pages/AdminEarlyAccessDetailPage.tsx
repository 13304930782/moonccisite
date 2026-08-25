import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
  const { id } = useParams();
  const [application, setApplication] = useState<any>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');

  const load = () => {
    setLoading(true);
    api(`/admin/early-access/${id}`)
      .then((data) => {
        setApplication(data);
        setReviewNote(data.review_note || '');
      })
      .catch((error) => setMessage(error.message || '申请加载失败。'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const action = async (endpoint: string, body: Record<string, unknown> = {}, confirmation?: string) => {
    if (confirmation && !window.confirm(confirmation)) return;
    setWorking(true);
    setMessage('');

    try {
      const response = await api(`/admin/early-access/${id}/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setMessage(response.message || '操作成功。');
      if (response.application) {
        setApplication(response.application);
        setReviewNote(response.application.review_note || '');
      } else {
        load();
      }
    } catch (error: any) {
      setMessage(error.message || '操作失败。');
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <div className="border-2 border-black bg-white p-6 font-bold shadow-[5px_5px_0_#000]">正在加载申请…</div>;
  if (!application) return <div className="border-2 border-black bg-white p-6 font-bold shadow-[5px_5px_0_#000]">{message || '申请不存在。'}</div>;

  const features = Array.isArray(application.desired_features) ? application.desired_features : [];

  return (
    <div>
      <Link to="/admin/early-access" className="neo-button bg-white"><ArrowLeft className="h-4 w-4" />返回申请列表</Link>

      <div className="mt-7 border-2 border-black bg-white p-6 shadow-[8px_8px_0_#000] md:p-9">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm font-black">APPLICATION #{application.id}</span>
              <span className={`border-2 border-black px-3 py-1 text-xs font-black ${application.status === 'pending' ? 'bg-[#ffe17c]' : application.status === 'approved' ? 'bg-[#b7c6c2]' : 'bg-white'}`}>
                {labels[application.status] || application.status}
              </span>
            </div>
            <h1 className="neo-heading mt-6 text-4xl md:text-5xl">{application.name}</h1>
            <p className="mt-3 font-bold text-black/55">{application.email}</p>
          </div>
          <div className="font-mono text-xs font-bold leading-6 text-black/50">
            提交：{formatDate(application.created_at)}<br />
            审核：{formatDate(application.reviewed_at)}
          </div>
        </div>

        <div className="mt-9 grid gap-0 border-2 border-black md:grid-cols-2">
          {[
            ['职业身份', labels[application.occupation] || application.occupation],
            ['当前设备', labels[application.device] || application.device],
            ['macOS 版本', application.macos_version],
            ['审核人', application.reviewer_name || '—'],
          ].map(([label, value]) => (
            <div key={label} className="border-b-2 border-black p-4 last:border-b-0 md:border-r-2 md:[&:nth-child(even)]:border-r-0 md:[&:nth-last-child(-n+2)]:border-b-0">
              <div className="font-mono text-xs font-black uppercase tracking-wider text-black/45">{label}</div>
              <div className="mt-2 font-bold">{value || '—'}</div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="border-2 border-black bg-[#b7c6c2] p-5">
            <h2 className="neo-heading text-2xl">主要使用场景</h2>
            <p className="mt-4 whitespace-pre-wrap text-sm font-bold leading-7">{application.use_case}</p>
          </section>
          <section className="border-2 border-black bg-[#ffe17c] p-5">
            <h2 className="neo-heading text-2xl">申请理由</h2>
            <p className="mt-4 whitespace-pre-wrap text-sm font-bold leading-7">{application.reason}</p>
          </section>
        </div>

        <section className="mt-6 border-2 border-black p-5">
          <h2 className="neo-heading text-2xl">希望体验的功能</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {features.map((feature: string) => <span key={feature} className="border-2 border-black bg-white px-3 py-2 text-sm font-black shadow-[2px_2px_0_#000]">{labels[feature] || feature}</span>)}
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="border-2 border-black p-5">
            <div className="flex items-center gap-2 font-black"><Mail className="h-4 w-4" />owner 通知</div>
            <p className="mt-3 text-sm font-bold text-black/55">发送时间：{formatDate(application.owner_notification_sent_at)}</p>
            {application.owner_notification_error && !application.owner_notification_sent_at && <p className="mt-2 text-sm font-bold text-red-700">{application.owner_notification_error}</p>}
            {!application.owner_notification_sent_at && (
              <button type="button" disabled={working} onClick={() => action('resend-owner-notification')} className="neo-button mt-4 bg-white"><RotateCcw className="h-4 w-4" />重试通知</button>
            )}
          </div>
          <div className="border-2 border-black p-5">
            <div className="flex items-center gap-2 font-black"><Mail className="h-4 w-4" />申请人通过邮件</div>
            <p className="mt-3 text-sm font-bold text-black/55">发送时间：{formatDate(application.approval_email_sent_at)}</p>
            {application.approval_email_error && !application.approval_email_sent_at && <p className="mt-2 text-sm font-bold text-red-700">{application.approval_email_error}</p>}
            {application.status === 'approved' && !application.approval_email_sent_at && (
              <button type="button" disabled={working} onClick={() => action('resend-approval-email')} className="neo-button mt-4 bg-[#ffe17c]"><RotateCcw className="h-4 w-4" />重试通过邮件</button>
            )}
          </div>
        </section>

        {message && <div role="status" className="mt-6 border-2 border-black bg-[#ffe17c] px-4 py-3 font-bold shadow-[3px_3px_0_#000]">{message}</div>}

        {application.status === 'pending' ? (
          <section className="mt-8 border-2 border-black bg-[#171e19] p-6 text-white">
            <label className="font-black">
              内部审核备注（不会发送给申请人）
              <textarea maxLength={2000} rows={4} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} className="neo-input mt-3 w-full px-4 py-3 text-black outline-none" />
            </label>
            <div className="mt-6 flex flex-wrap gap-4">
              <button
                type="button"
                disabled={working}
                onClick={() => action('approve', { reviewNote }, '确认批准这份申请并立即发送包含下载地址的邮件吗？')}
                className="neo-button neo-button-yellow disabled:opacity-50"
              >
                <Check className="h-4 w-4" />批准并发送邮件
              </button>
              <button
                type="button"
                disabled={working}
                onClick={() => action('reject', { reviewNote }, '确认拒绝这份申请吗？申请人不会收到邮件。')}
                className="neo-button bg-white text-black disabled:opacity-50"
              >
                <X className="h-4 w-4" />拒绝申请
              </button>
              <Link to="/admin/mail-settings" className="neo-button border-white bg-[#171e19] text-white shadow-[4px_4px_0_#fff]">
                <Settings className="h-4 w-4" />下载与邮件设置
              </Link>
            </div>
          </section>
        ) : application.review_note ? (
          <section className="mt-8 border-2 border-black bg-[#b7c6c2] p-5">
            <h2 className="font-black">内部审核备注</h2>
            <p className="mt-3 whitespace-pre-wrap text-sm font-bold leading-7">{application.review_note}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
