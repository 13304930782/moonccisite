import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Check, Clock3, Mail, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';

type Access = {
  requested_local_part: string;
  status: 'pending' | 'provisioning' | 'active' | 'rejected' | 'revoked';
  mailbox_address: string | null;
  daily_limit: number;
  review_note: string | null;
};
type Request = Access & { user_id: number; username: string; account_email: string; reason: string; created_at: string };
type Sent = { id: string; recipient_email: string; subject: string; status: string; created_at: string };

const labels: Record<Access['status'], string> = {
  pending: '等待审核', provisioning: '开通结果待核对', active: '已开通',
  rejected: '未通过', revoked: '已停用',
};

const field = 'w-full rounded-[12px] border border-border bg-card px-4 py-3 text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring';
const card = 'rounded-[18px] border border-border bg-card p-5 sm:p-7';

export default function MailboxPage() {
  const { user } = useAuth();
  const owner = user?.role === 'owner';
  const [access, setAccess] = useState<Access | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [sent, setSent] = useState<Sent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [localPart, setLocalPart] = useState('');
  const [reason, setReason] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');

  const refresh = useCallback(async () => {
    const [self, history, review] = await Promise.all([
      api('/mailboxes/me'), api('/mailboxes/sent'),
      owner ? api('/mailboxes/admin/requests') : Promise.resolve({ requests: [] }),
    ]);
    setAccess(self.access);
    setSent(history.messages);
    setRequests(review.requests);
  }, [owner]);

  useEffect(() => {
    refresh().catch((error) => setNotice(error.message || '邮箱状态暂时无法读取')).finally(() => setLoading(false));
  }, [refresh]);

  const apply = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      const result = await api('/mailboxes/apply', { method: 'POST', body: JSON.stringify({ localPart, reason }) });
      setNotice(result.message); await refresh();
    } catch (error: any) { setNotice(error.message || '提交失败，输入已保留。'); }
    finally { setBusy(false); }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      const result = await api('/mailboxes/send', { method: 'POST', body: JSON.stringify({ to, subject, content }) });
      setNotice(result.message); setTo(''); setSubject(''); setContent(''); await refresh();
    } catch (error: any) { setNotice(error.message || '发送失败，输入已保留。'); await refresh().catch(() => {}); }
    finally { setBusy(false); }
  };

  const review = async (request: Request, action: 'approve' | 'reject' | 'revoke') => {
    setBusy(true); setNotice('');
    try {
      const result = await api(`/mailboxes/admin/requests/${request.user_id}/${action}`, {
        method: 'POST', body: JSON.stringify(action === 'approve' ? { dailyLimit: 10 } : {}),
      });
      setNotice(result.message); await refresh();
    } catch (error: any) { setNotice(error.message || '操作失败，请刷新状态。'); await refresh().catch(() => {}); }
    finally { setBusy(false); }
  };

  return <main className="admin-page max-w-5xl space-y-6">
    <header className="admin-overview-head">
      <p className="eyebrow">mooncci / MAIL</p>
      <h1>我的邮箱</h1>
      <p>申请专属 @mooncci.site 地址；获批并开通后，可从网页发送到外部邮箱。</p>
    </header>

    {notice && <div role="status" aria-live="polite" className="rounded-[12px] border border-border bg-muted px-5 py-4 text-sm text-foreground">{notice}</div>}

    {loading ? <p className="text-muted-foreground">正在读取邮箱状态…</p> : <>
      <section className={card} aria-labelledby="mailbox-status-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-muted"><Mail aria-hidden="true" className="h-6 w-6" /></span>
            <div><h2 id="mailbox-status-title" className="text-xl font-semibold">{access?.mailbox_address || '专属邮箱'}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{access ? labels[access.status] : '尚未申请'}</p></div>
          </div>
          <button type="button" onClick={() => refresh().catch((error) => setNotice(error.message))} className="quiet-button inline-flex items-center gap-2"><RefreshCw className="h-4 w-4" />刷新状态</button>
        </div>
        {access?.review_note && <p className="mt-5 text-sm text-muted-foreground">审核说明：{access.review_note}</p>}
        {access?.status === 'active' && <p className="mt-5 text-sm text-muted-foreground">每日最多尝试发信 {access.daily_limit} 次。发送记录仅显示收件人、标题和提交结果，不保存正文。</p>}
        {access?.status === 'provisioning' && <p className="mt-5 text-sm text-muted-foreground">邮局创建结果尚未确认。站长核对前不能发送，请勿重复提交申请。</p>}
      </section>

      {(!access || access.status === 'rejected') && <section className={card} aria-labelledby="mailbox-apply-title">
        <div className="flex items-center gap-3"><ShieldCheck aria-hidden="true" className="h-5 w-5" /><h2 id="mailbox-apply-title" className="text-lg font-semibold">申请邮箱</h2></div>
        <form onSubmit={apply} className="mt-6 space-y-5">
          <div><label htmlFor="mail-local" className="mb-2 block text-sm font-medium">期望地址</label>
            <div className="flex items-center gap-2"><input id="mail-local" className={field} value={localPart} onChange={(event) => setLocalPart(event.target.value)} autoComplete="off" required maxLength={32} placeholder="your-name" /><span className="whitespace-nowrap text-sm text-muted-foreground">@mooncci.site</span></div>
            <p className="mt-2 text-xs text-muted-foreground">3–32 位，以字母开头；可用小写字母、数字、点、横线和下划线。</p></div>
          <div><label htmlFor="mail-reason" className="mb-2 block text-sm font-medium">申请说明</label>
            <textarea id="mail-reason" className={field} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={1000} required placeholder="请说明邮箱用途和预计发送对象。" /></div>
          <button className="quiet-button inline-flex items-center gap-2" disabled={busy}><Check className="h-4 w-4" />{busy ? '提交中…' : '提交申请'}</button>
        </form>
      </section>}

      {access?.status === 'active' && <section className={card} aria-labelledby="mail-compose-title">
        <div className="flex items-center gap-3"><Send aria-hidden="true" className="h-5 w-5" /><h2 id="mail-compose-title" className="text-lg font-semibold">写邮件</h2></div>
        <p className="mt-2 text-sm text-muted-foreground">发件人：{access.mailbox_address}</p>
        <form onSubmit={send} className="mt-6 space-y-5">
          <div><label htmlFor="mail-to" className="mb-2 block text-sm font-medium">收件人</label><input id="mail-to" type="email" className={field} value={to} onChange={(event) => setTo(event.target.value)} required placeholder="name@example.com" /></div>
          <div><label htmlFor="mail-subject" className="mb-2 block text-sm font-medium">标题</label><input id="mail-subject" className={field} value={subject} onChange={(event) => setSubject(event.target.value)} required maxLength={120} /></div>
          <div><label htmlFor="mail-body" className="mb-2 block text-sm font-medium">正文</label><textarea id="mail-body" className={field} value={content} onChange={(event) => setContent(event.target.value)} rows={10} required maxLength={10000} /></div>
          <button disabled={busy} className="quiet-button inline-flex items-center gap-2"><Send className="h-4 w-4" />{busy ? '发送中…' : '发送邮件'}</button>
        </form>
      </section>}

      {owner && <section className={card} aria-labelledby="mail-review-title">
        <div className="flex items-center gap-3"><ShieldCheck aria-hidden="true" className="h-5 w-5" /><h2 id="mail-review-title" className="text-lg font-semibold">申请审核</h2></div>
        {requests.length === 0 ? <p className="mt-5 text-sm text-muted-foreground">暂无申请。</p> : <div className="mt-5 space-y-3">{requests.map((item) => <article key={item.user_id} className="rounded-[12px] border border-border bg-muted/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-medium">{item.requested_local_part}@mooncci.site</h3><p className="mt-1 text-sm text-muted-foreground">{item.username} · {item.account_email}</p></div><span className="rounded-full bg-muted px-3 py-1 text-xs">{labels[item.status]}</span></div>
          <p className="mt-3 whitespace-pre-wrap text-sm">{item.reason}</p>
          {item.review_note && <p className="mt-2 text-sm text-muted-foreground">{item.review_note}</p>}
          {item.status === 'pending' && <div className="mt-4 flex flex-wrap gap-2"><button className="quiet-button" disabled={busy} onClick={() => review(item, 'approve')}>批准并开通</button><button className="quiet-button" disabled={busy} onClick={() => review(item, 'reject')}>拒绝</button></div>}
          {item.status === 'active' && <button className="quiet-button mt-4" disabled={busy} onClick={() => review(item, 'revoke')}>撤销网页发信权限</button>}
        </article>)}</div>}
      </section>}

      <section className={card} aria-labelledby="mail-history-title"><div className="flex items-center gap-3"><Clock3 aria-hidden="true" className="h-5 w-5" /><h2 id="mail-history-title" className="text-lg font-semibold">最近发送</h2></div>
        {sent.length === 0 ? <p className="mt-5 text-sm text-muted-foreground">暂无发送记录。</p> : <ul className="mt-5 divide-y divide-border">{sent.map((item) => <li key={item.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="min-w-0"><strong className="block truncate font-medium">{item.subject}</strong><span className="text-muted-foreground">{item.recipient_email}</span></span><span className="text-muted-foreground">{item.status === 'accepted' ? '邮局已接收' : item.status === 'uncertain' ? '结果待核对' : item.status === 'sending' ? '发送中' : '失败'}</span></li>)}</ul>}
      </section>
    </>}
  </main>;
}
