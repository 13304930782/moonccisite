import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Check, Copy, Eye, EyeOff, Inbox, KeyRound, Mail, RefreshCw, Send } from 'lucide-react';
import { api } from '../lib/api';
import { visibleDiagnostic } from '../lib/browserDiagnostics';
import { useAuth } from '../context/AuthContext';
import '../../styles/mailbox.css';

type Access = { status: 'pending' | 'provisioning' | 'active' | 'rejected' | 'revoked'; mailbox_address: string | null; daily_limit: number; review_note: string | null; password_change_status?: 'idle' | 'pending' | 'claimed' | 'review' | 'complete' };
type Sent = { id: string; recipient_email: string; subject: string; status: string };
type Folder = 'inbox' | 'sent';
type Message = { uid: number; from: string; to: string; subject: string; date: string | null; unread: boolean; size: number; text?: string; replyTo?: string; tooLarge?: boolean; attachments?: { filename: string; size: number }[] };
type MailList = { messages: Message[]; total: number; page: number; pageSize: number; uidValidity: string | null; folderAvailable: boolean };
const labels: Record<Access['status'], string> = { pending: '等待审核', provisioning: '开通结果待核对', active: '已开通', rejected: '未通过', revoked: '已停用' };

export default function MailboxPage() {
  const { user } = useAuth();
  // A changed signed-in identity must never inherit another account's in-flight state.
  return <MailboxContent key={user?.id || 'signed-out'} />;
}

function MailboxContent() {
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
  const [credentialMode, setCredentialMode] = useState<'reveal' | 'change' | null>(null);
  const [credentialChallenge, setCredentialChallenge] = useState('');
  const [credentialCode, setCredentialCode] = useState('');
  const [credentialPassword, setCredentialPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [credentialMessage, setCredentialMessage] = useState('');
  const [credentialError, setCredentialError] = useState('');
  const [credentialVisible, setCredentialVisible] = useState(false);
  const credentialInput = useRef<HTMLInputElement>(null);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [view, setView] = useState<Folder | 'compose'>('inbox');
  const [mailList, setMailList] = useState<MailList | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailError, setMailError] = useState('');
  const [folderRevision, setFolderRevision] = useState(0);
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyLoaded = useRef(false);
  const historyPending = useRef(false);
  // Header-only snapshots live in this keyed account component, never local/session storage.
  const folders = useRef<Partial<Record<Folder, { list: MailList; scroll: number }>>>({});
  const restoreScroll = useRef<number | null>(null);
  const mounted = useRef(true);
  const lifetime = useRef(new AbortController());
  const folderRequest = useRef<AbortController | null>(null);
  const folderVersion = useRef(0);
  const accountVersion = useRef(0);
  const historyVersion = useRef(0);
  useEffect(() => {
    if (loading || mailLoading || busy || (view !== 'compose' && !mailList && !mailError)) return;
    const frame = requestAnimationFrame(() => visibleDiagnostic(location.pathname, 'mail-ready'));
    return () => cancelAnimationFrame(frame);
  }, [loading, mailLoading, busy, view, mailList, selected, mailError]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; lifetime.current.abort(); folderRequest.current?.abort(); };
  }, []);
  const refresh = useCallback(async () => {
    const version = ++accountVersion.current;
    const self = await api('/mailboxes/me', { signal: lifetime.current.signal });
    if (mounted.current && version === accountVersion.current) setAccess(self.access);
  }, []);
  const refreshHistory = useCallback(async () => {
    if (historyPending.current) return;
    historyPending.current = true; setHistoryLoading(true);
    const version = ++historyVersion.current;
    try {
      const history = await api('/mailboxes/sent', { signal: lifetime.current.signal });
      if (mounted.current && version === historyVersion.current) { setSent(history.messages); setHistoryError(''); historyLoaded.current = true; }
    } catch {
      if (mounted.current && version === historyVersion.current) setHistoryError('发送记录暂未刷新，请稍后刷新查看。');
    } finally { historyPending.current = false; if (mounted.current) setHistoryLoading(false); }
  }, []);
  useEffect(() => {
    void refresh().catch(error => { if (mounted.current) setNotice(error.message || '邮箱状态暂时无法读取'); })
      .finally(() => { if (mounted.current) setLoading(false); });
  }, [refresh]);
  useEffect(() => {
    folders.current = {}; setMailList(null); setSelected(null);
    folderRequest.current?.abort(); folderVersion.current++;
  }, [access?.mailbox_address, access?.status, access?.password_change_status]);
  useEffect(() => {
    if (!['pending', 'claimed'].includes(access?.password_change_status || '')) return;
    const timer = window.setInterval(() => { void refresh().catch(() => {}); }, 5000);
    return () => window.clearInterval(timer);
  }, [access?.password_change_status, refresh]);
  useEffect(() => {
    if (!credentialPassword) return;
    const clear = () => { setCredentialPassword(''); setCredentialVisible(false); };
    const timer = window.setTimeout(clear, 60000);
    document.addEventListener('visibilitychange', clear);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', clear); };
  }, [credentialPassword]);
  const loadFolder = useCallback(async (folder: Folder, page = folders.current[folder]?.list.page || 1) => {
    folderRequest.current?.abort();
    const controller = new AbortController(); folderRequest.current = controller;
    const version = ++folderVersion.current;
    const current = () => mounted.current && version === folderVersion.current && !controller.signal.aborted;
    setMailLoading(true); setMailError(''); setSelected(null);
    try {
      const result = await api(`/mailboxes/folders/${folder}?page=${page}`, { signal: controller.signal });
      if (current()) {
        folders.current[folder] = { list: result, scroll: folders.current[folder]?.scroll || 0 };
        setMailList(result);
      }
    } catch (error: any) { if (current()) {
      if ([401,403,409].includes(error.status)) { folders.current = {}; setMailList(null); setSelected(null); }
      setMailError(error.message || '暂时无法读取邮件。');
    } }
    finally { if (current()) setMailLoading(false); }
  }, []);
  useEffect(() => {
    if (access?.status === 'active' && !['pending', 'claimed', 'review'].includes(access.password_change_status || '') && view !== 'compose') void loadFolder(view);
  }, [access?.status, access?.password_change_status, view, loadFolder, folderRevision]);
  useEffect(() => {
    if (selected || !mailList || restoreScroll.current === null) return;
    const y = restoreScroll.current; restoreScroll.current = null;
    const frame = requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'instant' }));
    return () => cancelAnimationFrame(frame);
  }, [selected, mailList, view]);
  const openMessage = async (message: Message) => {
    if (view === 'compose' || !mailList?.uidValidity) return;
    folders.current[view] = { list: mailList, scroll: window.scrollY };
    folderRequest.current?.abort();
    const controller = new AbortController(); folderRequest.current = controller;
    const version = ++folderVersion.current;
    const current = () => mounted.current && version === folderVersion.current && !controller.signal.aborted;
    setMailLoading(true); setMailError('');
    try {
      const result = await api(`/mailboxes/folders/${view}/${message.uid}?uidValidity=${mailList.uidValidity}`, { signal: controller.signal });
      if (!current()) return;
      setSelected(result.message);
      if (view === 'inbox') setMailList(previous => {
        if (!previous) return previous;
        const list = { ...previous, messages: previous.messages.map(item => item.uid === message.uid ? { ...item, unread: result.message.unread } : item) };
        folders.current.inbox = { list, scroll: folders.current.inbox?.scroll || 0 }; return list;
      });
    } catch (error: any) { if (current()) {
      if ([401,403,409].includes(error.status)) { folders.current = {}; setMailList(null); setSelected(null); }
      setMailError(error.message || '暂时无法读取邮件。');
    } }
    finally { if (current()) setMailLoading(false); }
  };
  const returnToList = () => {
    folderRequest.current?.abort(); folderVersion.current++;
    if (view !== 'compose') restoreScroll.current = folders.current[view]?.scroll || 0;
    setMailLoading(false); setSelected(null);
  };
  const changeView = (next: Folder | 'compose') => {
    if (next === view) { returnToList(); return; }
    if (view !== 'compose' && mailList && !selected) folders.current[view] = { list: mailList, scroll: window.scrollY };
    folderRequest.current?.abort(); folderVersion.current++;
    const snapshot = next === 'compose' ? undefined : folders.current[next];
    restoreScroll.current = snapshot?.scroll ?? null;
    setMailLoading(false); setMailError(''); setSelected(null); setMailList(snapshot?.list || null); setView(next);
  };
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setNotice('');
    try {
      await work();
      if (mounted.current) await refresh();
    }
    catch (error: any) { setNotice(error.message || '操作失败，请稍后重试。'); }
    finally { if (mounted.current) setBusy(false); }
  };
  const apply = (event: FormEvent) => { event.preventDefault(); void run(async () => {
    const result = await api('/mailboxes/apply', { method: 'POST', body: JSON.stringify({ localPart, reason }) }); setNotice(result.message);
  }); };
  const connect = (event: FormEvent) => { event.preventDefault(); void run(async () => {
    const result = await api('/mailboxes/owner/connect', { method: 'POST', body: JSON.stringify({ password }) });
    setPassword(''); setNotice(result.message);
  }); };
  const sendInFlight = useRef(false);
  const send = async (event: FormEvent) => {
    event.preventDefault(); if (sendInFlight.current) return;
    sendInFlight.current = true; setBusy(true); setNotice('');
    try {
      const result = await api('/mailboxes/send', { method: 'POST', body: JSON.stringify({ to, subject, content }) });
      if (!mounted.current) return;
      // Only a successful server response confirms acceptance. No guessed Sent UID/body.
      historyVersion.current++;
      delete folders.current.sent;
      setSent(previous => [{ id: result.id, recipient_email: to, subject, status: 'accepted' }, ...previous.filter(row => row.id !== result.id)].slice(0, 50));
      setHistoryError(''); setTo(''); setSubject(''); setContent(''); setNotice(result.message); changeView('sent');
      setFolderRevision(value => value + 1);
    } catch (error: any) { if (mounted.current) setNotice(error.message || '操作失败，请稍后重试。'); }
    finally { sendInFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const closeCredentials = () => { setCredentialMode(null); setCredentialChallenge(''); setCredentialCode(''); setCredentialPassword(''); setNewPassword(''); setConfirmPassword(''); setCredentialVisible(false); setCredentialMessage(''); setCredentialError(''); };
  const startCredentials = async (mode: 'reveal' | 'change') => {
    closeCredentials(); setCredentialMode(mode); setCredentialBusy(true);
    try { const result = await api('/mailboxes/credentials/code', { method: 'POST' }); setCredentialChallenge(result.challenge_id); setCredentialMessage(result.message); }
    catch (error: any) { setCredentialError(error.message || '验证码发送失败。'); }
    finally { setCredentialBusy(false); }
  };
  const revealCredentials = async (event: FormEvent) => { event.preventDefault(); setCredentialBusy(true); setCredentialError('');
    try { const result = await api('/mailboxes/credentials/reveal', { method: 'POST', body: JSON.stringify({ challenge_id: credentialChallenge, code: credentialCode }) }); setCredentialPassword(result.password); setCredentialChallenge(''); setCredentialCode(''); setCredentialMessage('密码仅在当前页面短暂显示，切换页面或 60 秒后自动隐藏。'); }
    catch (error: any) { setCredentialError(error.message || '验证失败。'); }
    finally { setCredentialBusy(false); }
  };
  const changeCredentials = async (event: FormEvent) => { event.preventDefault(); setCredentialError('');
    if (newPassword !== confirmPassword) { setCredentialError('两次输入的密码不一致。'); return; }
    setCredentialBusy(true);
    try { const result = await api('/mailboxes/credentials/change', { method: 'POST', body: JSON.stringify({ challenge_id: credentialChallenge, code: credentialCode, password: newPassword }) }); closeCredentials(); setCredentialMessage(result.message); await refresh(); }
    catch (error: any) { setCredentialError(error.message || '密码更新未完成，请刷新状态后重试。'); }
    finally { setCredentialBusy(false); }
  };
  const copyCredentials = async () => { if (!credentialPassword) return;
    try { await navigator.clipboard.writeText(credentialPassword); setCredentialMessage('密码已复制，请直接粘贴到邮件客户端。'); }
    catch { setCredentialVisible(true); credentialInput.current?.focus(); credentialInput.current?.select(); setCredentialMessage('浏览器未允许自动复制，密码已选中；请使用复制命令。'); }
  };

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
      {access?.status === 'active' && <>{owner && <section className="mailbox-account-line" aria-label="当前邮箱账号"><div><strong>{access.mailbox_address}</strong><span>已连接</span></div><span className="mailbox-badge">已开通</span></section>}
        <section className="mailbox-panel mailbox-credentials" aria-labelledby="mailbox-credentials-title">
          <div className="mailbox-panel-head"><span className="mailbox-icon"><KeyRound size={20} aria-hidden="true" /></span><div><h2 id="mailbox-credentials-title">在邮件客户端使用</h2><p>登录用户名是完整邮箱地址；收件与发件使用同一个密码。</p></div></div>
          <div className="mailbox-credential-actions"><Link className="mailbox-secondary" to={`/mail-setup?email=${encodeURIComponent(access.mailbox_address || '')}`}>查看客户端设置 <ArrowUpRight size={16} aria-hidden="true" /></Link>
            <button type="button" className="mailbox-secondary" onClick={() => void startCredentials('reveal')} disabled={credentialBusy || ['pending','claimed','review'].includes(access.password_change_status || '')}>查看并复制密码</button>
            <button type="button" className="mailbox-secondary" onClick={() => void startCredentials('change')} disabled={credentialBusy || ['pending','claimed','review'].includes(access.password_change_status || '')}>修改密码</button></div>
          {['pending','claimed'].includes(access.password_change_status || '') && <p className="mailbox-credential-status" role="status">密码更新已提交，正在等待邮局确认。确认后此处会自动刷新；请暂时不要在客户端使用新密码。</p>}
          {access.password_change_status === 'review' && <p className="mailbox-credential-status" role="alert">邮局未确认改密结果，收发信暂时停用。请联系站长核对，不要重复提交。</p>}
          {credentialMode && <div className="mailbox-credential-workflow"><div className="mailbox-credential-workflow-head"><strong>{credentialMode === 'reveal' ? '查看邮箱密码' : '修改邮箱密码'}</strong><button type="button" className="mailbox-text-button" onClick={closeCredentials} disabled={credentialBusy}>关闭</button></div>
            <p>{credentialPassword ? '验证已完成。请及时复制密码，并在使用后清空剪贴板。' : credentialChallenge ? '验证码已发送至你的登录邮箱。每个验证码仅可使用一次，10 分钟内有效。' : '请先完成邮箱验证码验证。'}</p>
            {credentialMode === 'reveal' && credentialPassword ? <div className="mailbox-credential-result"><label htmlFor="mailbox-current-password">邮箱密码</label><div className="mailbox-credential-secret"><input ref={credentialInput} id="mailbox-current-password" type={credentialVisible ? 'text' : 'password'} value={credentialPassword} readOnly autoComplete="off" spellCheck={false} /><button type="button" className="mailbox-secondary" aria-label={credentialVisible ? '隐藏密码' : '显示密码'} onClick={() => setCredentialVisible(value => !value)}>{credentialVisible ? <EyeOff size={17} /> : <Eye size={17} />}</button><button type="button" className="mailbox-primary" onClick={() => void copyCredentials()}><Copy size={16} aria-hidden="true" />复制密码</button></div></div> : credentialMode === 'reveal' ? <form className="mailbox-form" onSubmit={revealCredentials}><label htmlFor="mailbox-verify-code">邮件验证码</label><input id="mailbox-verify-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={credentialCode} onChange={event => setCredentialCode(event.target.value.replace(/\D/g, ''))} required /><button className="mailbox-primary" disabled={credentialBusy || !credentialChallenge || credentialCode.length !== 6}>验证并查看</button></form>
              : <form className="mailbox-form" onSubmit={changeCredentials}><label htmlFor="mailbox-change-code">邮件验证码</label><input id="mailbox-change-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={credentialCode} onChange={event => setCredentialCode(event.target.value.replace(/\D/g, ''))} required /><label htmlFor="mailbox-new-password">新邮箱密码</label><input id="mailbox-new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} required /><p className="mailbox-help">至少 12 位，包含大小写字母和数字，不含空格。改密后，其他邮件客户端也要更新密码。</p><label htmlFor="mailbox-confirm-password">确认新密码</label><input id="mailbox-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /><button className="mailbox-primary" disabled={credentialBusy || !credentialChallenge || credentialCode.length !== 6 || !newPassword || newPassword !== confirmPassword}>验证并提交改密</button></form>}
          </div>}
          {credentialMessage && <p className="mailbox-credential-status" role="status">{credentialMessage}</p>}{credentialError && <p className="mailbox-error" role="alert">{credentialError}</p>}
        </section>
        {!['pending','claimed','review'].includes(access.password_change_status || '') && <nav className="mailbox-view-tabs" aria-label="邮箱文件夹">
          <button type="button" aria-current={view === 'inbox' ? 'page' : undefined} onClick={() => changeView('inbox')}><Inbox size={17} aria-hidden="true" />收件箱</button>
          <button type="button" aria-current={view === 'sent' ? 'page' : undefined} onClick={() => changeView('sent')}><Send size={17} aria-hidden="true" />已发送</button>
          <button type="button" aria-current={view === 'compose' ? 'page' : undefined} onClick={() => changeView('compose')}><Mail size={17} aria-hidden="true" />写邮件</button>
        </nav>}
        {!['pending','claimed','review'].includes(access.password_change_status || '') && view !== 'compose' && <section className="mailbox-panel mailbox-letters" aria-labelledby="mail-folder-title">
          <div className="mailbox-folder-head"><div><h2 id="mail-folder-title">{view === 'inbox' ? '收件箱' : '已发送'}</h2><p>{mailList ? `${mailList.total} 封邮件` : '正在读取…'}</p></div>
            <button type="button" className="mailbox-secondary" onClick={() => void loadFolder(view, mailList?.page || 1)} disabled={mailLoading}><RefreshCw size={16} aria-hidden="true" />刷新</button></div>
          {mailError && <p className="mailbox-error" role="alert">{mailError}</p>}
          {mailLoading && mailList && <p className="mailbox-refresh-status" role="status">正在读取邮件…</p>}
          {selected ? <article className="mailbox-letter-detail"><button type="button" className="mailbox-back" onClick={returnToList}><ArrowLeft size={16} aria-hidden="true" />返回列表</button>
            <h3>{selected.subject}</h3><dl><div><dt>发件人</dt><dd>{selected.from || '未知'}</dd></div><div><dt>收件人</dt><dd>{selected.to || '未知'}</dd></div><div><dt>时间</dt><dd>{selected.date ? new Date(selected.date).toLocaleString('zh-CN') : '未知'}</dd></div></dl>
            {selected.tooLarge ? <p className="mailbox-empty">这封邮件超过网页阅读上限（2 MB），请使用邮件客户端查看。</p> : <>
              <pre className="mailbox-letter-body">{selected.text || '这封邮件没有可显示的纯文本正文。'}</pre>
              {!!selected.attachments?.length && <p className="mailbox-attachment-note">附件：{selected.attachments.map(item => item.filename).join('、')}。当前网页暂不提供附件下载，请使用邮件客户端查看。</p>}
            </>}
            {view === 'inbox' && selected.replyTo && <button type="button" className="mailbox-primary" onClick={() => { setTo(selected.replyTo || ''); setSubject(/^Re:/i.test(selected.subject) ? selected.subject : `Re: ${selected.subject}`); changeView('compose'); }}>回复</button>}
          </article> : mailLoading && !mailList ? <p className="mailbox-empty">正在读取邮件…</p> : !mailList?.folderAvailable ? <p className="mailbox-empty">邮局尚未提供已发送文件夹。你仍可正常收发邮件。</p> : !mailList.messages.length ? <p className="mailbox-empty">{view === 'inbox' ? '收件箱里还没有邮件。' : '已发送里还没有邮件。'}</p> : <ul className="mailbox-letter-list">{mailList.messages.map(item => <li key={item.uid}><button type="button" disabled={mailLoading} onClick={() => void openMessage(item)} className={item.unread ? 'mailbox-letter-unread' : ''}>
            <span className="mailbox-letter-correspondent">{view === 'inbox' ? item.from : item.to}</span><span className="mailbox-letter-subject">{item.subject}</span><time>{item.date ? new Date(item.date).toLocaleString('zh-CN') : ''}</time></button></li>)}</ul>}
          {!selected && mailList && mailList.total > mailList.pageSize && <div className="mailbox-list-pages"><span>第 {mailList.page} 页</span><div><button type="button" className="mailbox-secondary" disabled={mailLoading || mailList.page <= 1} onClick={() => void loadFolder(view, mailList.page - 1)}>上一页</button><button type="button" className="mailbox-secondary" disabled={mailLoading || mailList.page * mailList.pageSize >= mailList.total} onClick={() => void loadFolder(view, mailList.page + 1)}>下一页</button></div></div>}
        </section>}
        {!['pending','claimed','review'].includes(access.password_change_status || '') && view === 'compose' && <section className="mailbox-panel" aria-labelledby="mail-compose-title"><div className="mailbox-panel-head"><span className="mailbox-icon"><Send size={20} aria-hidden="true" /></span><div><h2 id="mail-compose-title">写邮件</h2><p>发件人：{access.mailbox_address}</p></div></div>
          <form onSubmit={send} className="mailbox-form"><label htmlFor="mail-to">收件人</label><input id="mail-to" type="email" value={to} onChange={event => setTo(event.target.value)} required placeholder="name@example.com" />
            <label htmlFor="mail-subject">标题</label><input id="mail-subject" value={subject} onChange={event => setSubject(event.target.value)} required maxLength={120} />
            <label htmlFor="mail-body">正文</label><textarea id="mail-body" value={content} onChange={event => setContent(event.target.value)} rows={9} required maxLength={10000} />
            <div className="mailbox-form-footer"><p>发送后，邮件会保存到已发送文件夹。</p><button className="mailbox-primary" disabled={busy}>{busy ? '发送中…' : '发送邮件'}</button></div></form></section>}</>}
      {access?.status === 'active' && view === 'sent' && <details className="mailbox-panel mailbox-history" onToggle={event => { if (event.currentTarget.open && !historyLoaded.current) void refreshHistory(); }}><summary id="mail-history-title">网页发送记录</summary><p className="mailbox-footnote">查看网页发送的状态记录。</p>
        {historyError && <p className="mailbox-error" role="alert">{historyError}<button type="button" className="mailbox-text-button" onClick={() => void refreshHistory()}>刷新记录</button></p>}
        {historyLoading && <p role="status">正在加载记录…</p>}{sent.length === 0 ? <p className="mailbox-empty">{historyLoading ? "" : "暂无发送记录。"}</p> : <ul>{sent.map(item => <li key={item.id}><div><strong>{item.subject}</strong><span>{item.recipient_email}</span></div><span>{item.status === 'accepted' ? '已发送' : item.status === 'uncertain' ? '结果待核对' : item.status === 'sending' ? '发送中' : '失败'}</span></li>)}</ul>}</details>}
    </>}
  </main>;
}
