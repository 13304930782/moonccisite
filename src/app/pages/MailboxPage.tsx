import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Check, Inbox, Mail, RefreshCw, Send } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import '../../styles/mailbox.css';

type Access = { status: 'pending' | 'provisioning' | 'active' | 'rejected' | 'revoked'; mailbox_address: string | null; daily_limit: number; review_note: string | null };
type Sent = { id: string; recipient_email: string; subject: string; status: string };
type Folder = 'inbox' | 'sent';
type Message = { uid: number; from: string; to: string; subject: string; date: string | null; unread: boolean; size: number; text?: string; replyTo?: string; tooLarge?: boolean; attachments?: { filename: string; size: number }[] };
type MailList = { messages: Message[]; total: number; page: number; pageSize: number; uidValidity: string | null; folderAvailable: boolean };
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
  const [view, setView] = useState<Folder | 'compose'>('inbox');
  const [mailList, setMailList] = useState<MailList | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailError, setMailError] = useState('');
  const refresh = useCallback(async () => {
    const [self, history] = await Promise.all([api('/mailboxes/me'), api('/mailboxes/sent')]);
    setAccess(self.access); setSent(history.messages);
  }, []);
  useEffect(() => { refresh().catch(error => setNotice(error.message || '邮箱状态暂时无法读取')).finally(() => setLoading(false)); }, [refresh]);
  const loadFolder = useCallback(async (folder: Folder, page = 1) => {
    setMailLoading(true); setMailError(''); setSelected(null);
    try {
      const result = await api(`/mailboxes/folders/${folder}?page=${page}`);
      setMailList(result);
    } catch (error: any) { setMailError(error.message || '暂时无法读取邮件。'); }
    finally { setMailLoading(false); }
  }, []);
  useEffect(() => {
    if (access?.status === 'active' && view !== 'compose') void loadFolder(view);
  }, [access?.status, view, loadFolder]);
  const openMessage = async (message: Message) => {
    if (view === 'compose' || !mailList?.uidValidity) return;
    setMailLoading(true); setMailError('');
    try {
      const result = await api(`/mailboxes/folders/${view}/${message.uid}?uidValidity=${mailList.uidValidity}`);
      setSelected(result.message);
      if (view === 'inbox') setMailList(previous => previous && ({ ...previous, messages: previous.messages.map(item => item.uid === message.uid ? { ...item, unread: false } : item) }));
    } catch (error: any) { setMailError(error.message || '暂时无法读取邮件。'); }
    finally { setMailLoading(false); }
  };
  const changeView = (next: Folder | 'compose') => { setSelected(null); setMailList(null); setView(next); };
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
    setTo(''); setSubject(''); setContent(''); setNotice(result.message); changeView('sent');
  }); };

  return <main className="mailbox-page">
    <header className="mailbox-heading"><div><p className="mailbox-eyebrow">mooncci / MAIL</p><h1>我的邮箱</h1>
      <p>{access?.status === 'active' ? '在这里收信、读信和发送邮件。' : '申请专属 @mooncci.site 地址，获批后即可收发邮件。'}</p></div>
      {owner && <Link className="mailbox-review-link" to="/admin/mailbox-requests">邮箱申请与权限 <ArrowUpRight size={16} aria-hidden="true" /></Link>}
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
        {access?.status === 'active' && <p className="mailbox-footnote">{access.daily_limit === 0 ? '未设置每日发信上限。' : `每日发信上限 ${access.daily_limit} 封。`}</p>}
        {access?.review_note && <p className="mailbox-footnote">审核说明：{access.review_note}</p>}
        {access?.status === 'provisioning' && <p className="mailbox-footnote">邮局创建结果尚未确认，站长核对前不能发信。</p>}
        {access?.status === 'revoked' && <p className="mailbox-footnote">网页发信权限已停用，请联系站长。</p>}
      </section>}
      {!owner && (!access || access.status === 'rejected') && <section className="mailbox-panel" aria-labelledby="mailbox-apply-title"><div className="mailbox-panel-head"><span className="mailbox-icon"><Check size={20} aria-hidden="true" /></span><div><h2 id="mailbox-apply-title">申请邮箱</h2><p>提交后由站长审核。</p></div></div>
        <form onSubmit={apply} className="mailbox-form"><label htmlFor="mail-local">期望地址</label><div className="mailbox-address"><input id="mail-local" value={localPart} onChange={event => setLocalPart(event.target.value)} autoComplete="off" required maxLength={32} placeholder="your-name" /><span>@mooncci.site</span></div>
          <p className="mailbox-help">3–32 位，以字母开头；可用小写字母、数字、点、横线和下划线。</p><label htmlFor="mail-reason">申请说明</label>
          <textarea id="mail-reason" rows={4} value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={1000} required placeholder="说明邮箱用途和预计发送对象" />
          <button className="mailbox-primary" disabled={busy}>{busy ? '提交中…' : '提交申请'}</button></form></section>}
      {access?.status === 'active' && <><section className="mailbox-account-line" aria-label="当前邮箱账号"><div><strong>{access.mailbox_address}</strong><span>已连接</span></div><span className="mailbox-badge">已开通</span></section>
        <nav className="mailbox-view-tabs" aria-label="邮箱文件夹">
          <button type="button" aria-current={view === 'inbox' ? 'page' : undefined} onClick={() => changeView('inbox')}><Inbox size={17} aria-hidden="true" />收件箱</button>
          <button type="button" aria-current={view === 'sent' ? 'page' : undefined} onClick={() => changeView('sent')}><Send size={17} aria-hidden="true" />已发送</button>
          <button type="button" aria-current={view === 'compose' ? 'page' : undefined} onClick={() => changeView('compose')}><Mail size={17} aria-hidden="true" />写邮件</button>
        </nav>
        {view !== 'compose' && <section className="mailbox-panel mailbox-letters" aria-labelledby="mail-folder-title">
          <div className="mailbox-folder-head"><div><h2 id="mail-folder-title">{view === 'inbox' ? '收件箱' : '已发送'}</h2><p>{mailList ? `${mailList.total} 封邮件` : '正在读取…'}</p></div>
            <button type="button" className="mailbox-secondary" onClick={() => void loadFolder(view, mailList?.page || 1)} disabled={mailLoading}><RefreshCw size={16} aria-hidden="true" />刷新</button></div>
          {mailError && <p className="mailbox-error" role="alert">{mailError}</p>}
          {selected ? <article className="mailbox-letter-detail"><button type="button" className="mailbox-back" onClick={() => setSelected(null)}><ArrowLeft size={16} aria-hidden="true" />返回列表</button>
            <h3>{selected.subject}</h3><dl><div><dt>发件人</dt><dd>{selected.from || '未知'}</dd></div><div><dt>收件人</dt><dd>{selected.to || '未知'}</dd></div><div><dt>时间</dt><dd>{selected.date ? new Date(selected.date).toLocaleString('zh-CN') : '未知'}</dd></div></dl>
            {selected.tooLarge ? <p className="mailbox-empty">这封邮件超过网页阅读上限（2 MB），请使用邮件客户端查看。</p> : <>
              <pre className="mailbox-letter-body">{selected.text || '这封邮件没有可显示的纯文本正文。'}</pre>
              {!!selected.attachments?.length && <p className="mailbox-attachment-note">附件：{selected.attachments.map(item => item.filename).join('、')}。当前网页暂不提供附件下载，请使用邮件客户端查看。</p>}
            </>}
            {view === 'inbox' && selected.replyTo && <button type="button" className="mailbox-primary" onClick={() => { setTo(selected.replyTo || ''); setSubject(/^Re:/i.test(selected.subject) ? selected.subject : `Re: ${selected.subject}`); changeView('compose'); }}>回复</button>}
          </article> : mailLoading ? <p className="mailbox-empty">正在读取邮件…</p> : !mailList?.folderAvailable ? <p className="mailbox-empty">邮局尚未提供已发送文件夹。你仍可正常收发邮件。</p> : !mailList.messages.length ? <p className="mailbox-empty">{view === 'inbox' ? '收件箱里还没有邮件。' : '已发送里还没有邮件。'}</p> : <ul className="mailbox-letter-list">{mailList.messages.map(item => <li key={item.uid}><button type="button" onClick={() => void openMessage(item)} className={item.unread ? 'mailbox-letter-unread' : ''}>
            <span className="mailbox-letter-correspondent">{view === 'inbox' ? item.from : item.to}</span><span className="mailbox-letter-subject">{item.subject}</span><time>{item.date ? new Date(item.date).toLocaleString('zh-CN') : ''}</time></button></li>)}</ul>}
          {!selected && mailList && mailList.total > mailList.pageSize && <div className="mailbox-list-pages"><span>第 {mailList.page} 页</span><div><button type="button" className="mailbox-secondary" disabled={mailLoading || mailList.page <= 1} onClick={() => void loadFolder(view, mailList.page - 1)}>上一页</button><button type="button" className="mailbox-secondary" disabled={mailLoading || mailList.page * mailList.pageSize >= mailList.total} onClick={() => void loadFolder(view, mailList.page + 1)}>下一页</button></div></div>}
        </section>}
        {view === 'compose' && <section className="mailbox-panel" aria-labelledby="mail-compose-title"><div className="mailbox-panel-head"><span className="mailbox-icon"><Send size={20} aria-hidden="true" /></span><div><h2 id="mail-compose-title">写邮件</h2><p>发件人：{access.mailbox_address}</p></div></div>
          <form onSubmit={send} className="mailbox-form"><label htmlFor="mail-to">收件人</label><input id="mail-to" type="email" value={to} onChange={event => setTo(event.target.value)} required placeholder="name@example.com" />
            <label htmlFor="mail-subject">标题</label><input id="mail-subject" value={subject} onChange={event => setSubject(event.target.value)} required maxLength={120} />
            <label htmlFor="mail-body">正文</label><textarea id="mail-body" value={content} onChange={event => setContent(event.target.value)} rows={9} required maxLength={10000} />
            <div className="mailbox-form-footer"><p>发送后，邮件会保存到已发送文件夹。</p><button className="mailbox-primary" disabled={busy}>{busy ? '发送中…' : '发送邮件'}</button></div></form></section>}</>}
      {access?.status === 'active' && view === 'sent' && <section className="mailbox-panel mailbox-history" aria-labelledby="mail-history-title"><div className="mailbox-panel-head"><div><h2 id="mail-history-title">网页发送记录</h2><p>保留此前的发送状态记录；旧记录不包含正文。</p></div></div>
        {sent.length === 0 ? <p className="mailbox-empty">暂无发送记录。</p> : <ul>{sent.map(item => <li key={item.id}><div><strong>{item.subject}</strong><span>{item.recipient_email}</span></div><span>{item.status === 'accepted' ? '已发送' : item.status === 'uncertain' ? '结果待核对' : item.status === 'sending' ? '发送中' : '失败'}</span></li>)}</ul>}</section>}
    </>}
  </main>;
}
