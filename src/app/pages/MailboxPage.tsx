import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, Mail, RefreshCw, Send } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import '../../styles/mailbox.css';

type Access = { status: 'pending' | 'provisioning' | 'active' | 'rejected' | 'revoked'; mailbox_address: string | null; daily_limit: number; review_note: string | null };
type Sent = { id: string; recipient_email: string; subject: string; status: string };
const labels: Record<Access['status'], string> = { pending: '等待审核', provisioning: '开通结果待核对', active: '已开通', rejected: '未通过', revoked: '已停用' };

export default function MailboxPage() {
  const { user } = useAuth();
  const owner = user?.role === 'owner';
  const [access, setAccess] = useState<Access | null>(null);
  const [sent, setSent] = useState<Sent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [localPart, setLocalPart] = useState('');
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const refresh = useCallback(async () => {
    const [self, history] = await Promise.all([api('/mailboxes/me'), api('/mailboxes/sent')]);
    setAccess(self.access); setSent(history.messages);
  }, []);
  useEffect(() => { refresh().catch(error => setNotice(error.message || '邮箱状态暂时无法读取')).finally(() => setLoading(false)); }, [refresh]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setNotice('');
    try { await work(); await refresh(); }
    catch (error: any) { setNotice(error.message || '操作失败，请稍后重试。'); }
    finally { setBusy(false); }
  };
  const apply = (event: FormEvent) => { event.preventDefault(); void run(async () => {
    const result = await api('/mailboxes/apply', { method: 'POST', body: JSON.stringify({ localPart, reason }) }); setNotice(result.message);
  }); };
  const connect = (event: FormEvent) => { event.preventDefault(); void run(async () => {
    const result = await api('/mailboxes/owner/connect', { method: 'POST', body: JSON.stringify({ password }) });
    setPassword(''); setNotice(result.message);
  }); };
  const send = (event: FormEvent) => { event.preventDefault(); void run(async () => {
    const result = await api('/mailboxes/send', { method: 'POST', body: JSON.stringify({ to, subject, content }) });
    setTo(''); setSubject(''); setContent(''); setNotice(result.message);
  }); };

  return <main className="mailbox-page">
    <header className="mailbox-heading"><div><p className="mailbox-eyebrow">mooncci / MAIL</p><h1>{owner ? '发邮件' : '我的邮箱'}</h1>
      <p>{owner ? '使用你的 mooncci 邮箱发信。申请审批在独立页面处理。' : '申请专属 @mooncci.site 地址，获批后可向外部邮箱发信。'}</p></div>
      {owner && <Link className="mailbox-review-link" to="/admin/mailbox-requests">邮箱申请审核 <ArrowUpRight size={16} aria-hidden="true" /></Link>}
    </header>
    {notice && <p role="status" aria-live="polite" className="mailbox-notice">{notice}</p>}
    {loading ? <p className="mailbox-empty">正在读取邮箱状态…</p> : <>
      {owner && access?.status !== 'active' && <section className="mailbox-panel" aria-labelledby="mailbox-connect-title">
        <div className="mailbox-panel-head"><span className="mailbox-icon"><Mail size={20} aria-hidden="true" /></span><div><h2 id="mailbox-connect-title">连接现有邮箱</h2><p>mooncci@mooncci.site</p></div></div>
        <p className="mailbox-explainer">输入这个邮箱的现有密码，网站会通过加密连接向邮局验证。不会重置宝塔邮箱，也不会把密码显示给其他用户。</p>
        <form onSubmit={connect} className="mailbox-form"><label htmlFor="owner-mail-password">现有邮箱密码</label><div className="mailbox-inline">
          <input id="owner-mail-password" type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} minLength={8} maxLength={256} required />
          <button className="mailbox-primary" disabled={busy}>{busy ? '验证中…' : '连接并启用发信'}</button></div></form>
        {access?.status === 'revoked' && <p className="mailbox-footnote">之前的测试邮箱已停用；连接后此处将显示现有 mooncci 邮箱。</p>}
      </section>}
      {!owner && <section className="mailbox-panel" aria-labelledby="mailbox-status-title"><div className="mailbox-panel-head"><span className="mailbox-icon"><Mail size={20} aria-hidden="true" /></span><div>
        <h2 id="mailbox-status-title">{access?.mailbox_address || '专属邮箱'}</h2><p>{access ? labels[access.status] : '尚未申请'}</p></div>
        <button type="button" onClick={() => refresh().catch(error => setNotice(error.message))} className="mailbox-secondary mailbox-refresh"><RefreshCw size={16} aria-hidden="true" />刷新状态</button></div>
        {access?.review_note && <p className="mailbox-footnote">审核说明：{access.review_note}</p>}
        {access?.status === 'provisioning' && <p className="mailbox-footnote">邮局创建结果尚未确认，站长核对前不能发信。</p>}
        {access?.status === 'revoked' && <p className="mailbox-footnote">网页发信权限已停用，请联系站长。</p>}
      </section>}
      {!owner && (!access || access.status === 'rejected') && <section className="mailbox-panel" aria-labelledby="mailbox-apply-title"><div className="mailbox-panel-head"><span className="mailbox-icon"><Check size={20} aria-hidden="true" /></span><div><h2 id="mailbox-apply-title">申请邮箱</h2><p>提交后由站长审核。</p></div></div>
        <form onSubmit={apply} className="mailbox-form"><label htmlFor="mail-local">期望地址</label><div className="mailbox-address"><input id="mail-local" value={localPart} onChange={event => setLocalPart(event.target.value)} autoComplete="off" required maxLength={32} placeholder="your-name" /><span>@mooncci.site</span></div>
          <p className="mailbox-help">3–32 位，以字母开头；可用小写字母、数字、点、横线和下划线。</p><label htmlFor="mail-reason">申请说明</label>
          <textarea id="mail-reason" rows={4} value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={1000} required placeholder="说明邮箱用途和预计发送对象" />
          <button className="mailbox-primary" disabled={busy}>{busy ? '提交中…' : '提交申请'}</button></form></section>}
      {access?.status === 'active' && <><section className="mailbox-account-line" aria-label="当前发件账号"><div><strong>{access.mailbox_address}</strong><span>每日最多尝试发信 {access.daily_limit} 次</span></div><span className="mailbox-badge">已开通</span></section>
        <section className="mailbox-panel" aria-labelledby="mail-compose-title"><div className="mailbox-panel-head"><span className="mailbox-icon"><Send size={20} aria-hidden="true" /></span><div><h2 id="mail-compose-title">写邮件</h2><p>发件人：{access.mailbox_address}</p></div></div>
          <form onSubmit={send} className="mailbox-form"><label htmlFor="mail-to">收件人</label><input id="mail-to" type="email" value={to} onChange={event => setTo(event.target.value)} required placeholder="name@example.com" />
            <label htmlFor="mail-subject">标题</label><input id="mail-subject" value={subject} onChange={event => setSubject(event.target.value)} required maxLength={120} />
            <label htmlFor="mail-body">正文</label><textarea id="mail-body" value={content} onChange={event => setContent(event.target.value)} rows={9} required maxLength={10000} />
            <div className="mailbox-form-footer"><p>提交给邮局后，实际送达仍取决于收件方。</p><button className="mailbox-primary" disabled={busy}>{busy ? '发送中…' : '发送邮件'}</button></div></form></section></>}
      <section className="mailbox-panel mailbox-history" aria-labelledby="mail-history-title"><div className="mailbox-panel-head"><div><h2 id="mail-history-title">最近发送</h2><p>只记录收件人、标题和提交结果，不保存正文。</p></div></div>
        {sent.length === 0 ? <p className="mailbox-empty">暂无发送记录。</p> : <ul>{sent.map(item => <li key={item.id}><div><strong>{item.subject}</strong><span>{item.recipient_email}</span></div><span>{item.status === 'accepted' ? '邮局已接收' : item.status === 'uncertain' ? '结果待核对' : item.status === 'sending' ? '发送中' : '失败'}</span></li>)}</ul>}</section>
    </>}
  </main>;
}
