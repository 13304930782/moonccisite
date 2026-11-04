import { useI18n } from '../i18n';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import {Link} from '../components/LocaleLink';
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
  const { locale,  t } = useI18n();
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
      if (mounted.current && version === historyVersion.current) setHistoryError(t("m_e61081ca30"));
    } finally { historyPending.current = false; if (mounted.current) setHistoryLoading(false); }
  }, []);
  useEffect(() => {
    void refresh().catch(error => { if (mounted.current) setNotice(error.message || t("m_8956835f94")); })
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
      setMailError(error.message || t("m_e0f46c4f8d"));
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
      setMailError(error.message || t("m_e0f46c4f8d"));
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
    catch (error: any) { setNotice(error.message || t("m_2c1e5ec621")); }
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
    } catch (error: any) { if (mounted.current) setNotice(error.message || t("m_2c1e5ec621")); }
    finally { sendInFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const closeCredentials = () => { setCredentialMode(null); setCredentialChallenge(''); setCredentialCode(''); setCredentialPassword(''); setNewPassword(''); setConfirmPassword(''); setCredentialVisible(false); setCredentialMessage(''); setCredentialError(''); };
  const startCredentials = async (mode: 'reveal' | 'change') => {
    closeCredentials(); setCredentialMode(mode); setCredentialBusy(true);
    try { const result = await api('/mailboxes/credentials/code', { method: 'POST' }); setCredentialChallenge(result.challenge_id); setCredentialMessage(result.message); }
    catch (error: any) { setCredentialError(error.message || t("m_61a107ff57")); }
    finally { setCredentialBusy(false); }
  };
  const revealCredentials = async (event: FormEvent) => { event.preventDefault(); setCredentialBusy(true); setCredentialError('');
    try { const result = await api('/mailboxes/credentials/reveal', { method: 'POST', body: JSON.stringify({ challenge_id: credentialChallenge, code: credentialCode }) }); setCredentialPassword(result.password); setCredentialChallenge(''); setCredentialCode(''); setCredentialMessage(t("m_09c0c54e44")); }
    catch (error: any) { setCredentialError(error.message || t("m_94835c45ef")); }
    finally { setCredentialBusy(false); }
  };
  const changeCredentials = async (event: FormEvent) => { event.preventDefault(); setCredentialError('');
    if (newPassword !== confirmPassword) { setCredentialError(t("m_9daceebc80")); return; }
    setCredentialBusy(true);
    try { const result = await api('/mailboxes/credentials/change', { method: 'POST', body: JSON.stringify({ challenge_id: credentialChallenge, code: credentialCode, password: newPassword }) }); closeCredentials(); setCredentialMessage(result.message); await refresh(); }
    catch (error: any) { setCredentialError(error.message || t("m_14c3cb5dbd")); }
    finally { setCredentialBusy(false); }
  };
  const copyCredentials = async () => { if (!credentialPassword) return;
    try { await navigator.clipboard.writeText(credentialPassword); setCredentialMessage(t("m_02315f5262")); }
    catch { setCredentialVisible(true); credentialInput.current?.focus(); credentialInput.current?.select(); setCredentialMessage(t("m_93e5a6e8ec")); }
  };

  return <main className="mailbox-page">
    <header className="mailbox-heading"><div><p className="mailbox-eyebrow">mooncci / MAIL</p><h1>{t("m_2d7256702a")}</h1>
      <p>{access?.status === 'active' ? t("m_94cfb2238a") : t("m_ec56da8065")}</p></div>
      {owner && <Link className="mailbox-review-link" to="/admin/mailbox-requests">{t("m_41f3c254fe")} <ArrowUpRight size={16} aria-hidden="true" /></Link>}
    </header>
    {notice && <p role="status" aria-live="polite" className="mailbox-notice">{t(notice)}</p>}
    {loading ? <p className="mailbox-empty">{t("m_63ee59a104")}</p> : <>
      {owner && access?.status !== 'active' && <section className="mailbox-panel" aria-labelledby="mailbox-connect-title">
        <div className="mailbox-panel-head"><span className="mailbox-icon"><Mail size={20} aria-hidden="true" /></span><div><h2 id="mailbox-connect-title">{t("m_28201a8f6c")}</h2><p>mooncci@mooncci.site</p></div></div>
        <p className="mailbox-explainer">{t("m_4e841d4d0b")}</p>
        <form onSubmit={connect} className="mailbox-form"><label htmlFor="owner-mail-password">{t("m_f438487d7a")}</label><div className="mailbox-inline">
          <input id="owner-mail-password" type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} minLength={8} maxLength={256} required />
          <button className="mailbox-primary" disabled={busy}>{busy ? t("m_7f2d0739a2") : t("m_5aa28dcf62")}</button></div></form>
        {access?.status === 'revoked' && <p className="mailbox-footnote">{t("m_9fbb2222a6")}</p>}
      </section>}
      {!owner && <section className="mailbox-panel" aria-labelledby="mailbox-status-title"><div className="mailbox-panel-head"><span className="mailbox-icon"><Mail size={20} aria-hidden="true" /></span><div>
        <h2 id="mailbox-status-title">{access?.mailbox_address || t("m_9103e931e4")}</h2><p>{access ? t(labels[access.status]) : t("m_d7da7be6f7")}</p></div>
        <button type="button" onClick={() => refresh().catch(error => setNotice(error.message))} className="mailbox-secondary mailbox-refresh"><RefreshCw size={16} aria-hidden="true" />{t("m_802a407c77")}</button></div>
        {access?.status === 'active' && <p className="mailbox-footnote">{access.daily_limit === 0 ? t("m_b4fdc08432") : t("m_71a9245c73", {v0: access.daily_limit})}</p>}
        {access?.review_note && <p className="mailbox-footnote">{t("m_ff02dbb07f")}{access.review_note}</p>}
        {access?.status === 'provisioning' && <p className="mailbox-footnote">{t("m_43b4cb7e02")}</p>}
        {access?.status === 'revoked' && <p className="mailbox-footnote">{t("m_e00c4b6317")}</p>}
      </section>}
      {!owner && (!access || access.status === 'rejected') && <section className="mailbox-panel" aria-labelledby="mailbox-apply-title"><div className="mailbox-panel-head"><span className="mailbox-icon"><Check size={20} aria-hidden="true" /></span><div><h2 id="mailbox-apply-title">{t("m_8e2cfa2945")}</h2><p>{t("m_0abe073d69")}</p></div></div>
        <form onSubmit={apply} className="mailbox-form"><label htmlFor="mail-local">{t("m_20c8a1f510")}</label><div className="mailbox-address"><input id="mail-local" value={localPart} onChange={event => setLocalPart(event.target.value)} autoComplete="off" required maxLength={32} placeholder="your-name" /><span>@mooncci.site</span></div>
          <p className="mailbox-help">{t("m_9867160539")}</p><label htmlFor="mail-reason">{t("m_c033e6eeed")}</label>
          <textarea id="mail-reason" rows={4} value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={1000} required placeholder={t("m_801b078d6d")} />
          <button className="mailbox-primary" disabled={busy}>{busy ? t("m_18931020ad") : t("m_9cc5e4d81e")}</button></form></section>}
      {access?.status === 'active' && <>{owner && <section className="mailbox-account-line" aria-label={t("m_1de31f0f66")}><div><strong>{access.mailbox_address}</strong><span>{t("m_5be0323e8a")}</span></div><span className="mailbox-badge">{t("m_f2b6b313b8")}</span></section>}
        <section className="mailbox-panel mailbox-credentials" aria-labelledby="mailbox-credentials-title">
          <div className="mailbox-panel-head"><span className="mailbox-icon"><KeyRound size={20} aria-hidden="true" /></span><div><h2 id="mailbox-credentials-title">{t("m_915d7ffa78")}</h2><p>{t("m_403039b061")}</p></div></div>
          <div className="mailbox-credential-actions"><Link className="mailbox-secondary" to={`/mail-setup?email=${encodeURIComponent(access.mailbox_address || '')}`}>{t("m_988125a325")} <ArrowUpRight size={16} aria-hidden="true" /></Link>
            <button type="button" className="mailbox-secondary" onClick={() => void startCredentials('reveal')} disabled={credentialBusy || ['pending','claimed','review'].includes(access.password_change_status || '')}>{t("m_e04d4a0aef")}</button>
            <button type="button" className="mailbox-secondary" onClick={() => void startCredentials('change')} disabled={credentialBusy || ['pending','claimed','review'].includes(access.password_change_status || '')}>{t("m_08d0080624")}</button></div>
          {['pending','claimed'].includes(access.password_change_status || '') && <p className="mailbox-credential-status" role="status">{t("m_25925d0592")}</p>}
          {access.password_change_status === 'review' && <p className="mailbox-credential-status" role="alert">{t("m_239889d2d3")}</p>}
          {credentialMode && <div className="mailbox-credential-workflow"><div className="mailbox-credential-workflow-head"><strong>{credentialMode === 'reveal' ? t("m_1d39c4f26c") : t("m_3504d481ec")}</strong><button type="button" className="mailbox-text-button" onClick={closeCredentials} disabled={credentialBusy}>{t("m_3fd47edce4")}</button></div>
            <p>{credentialPassword ? t("m_d12d9415e4") : credentialChallenge ? t("m_57292035a0") : t("m_c5f844220e")}</p>
            {credentialMode === 'reveal' && credentialPassword ? <div className="mailbox-credential-result"><label htmlFor="mailbox-current-password">{t("m_ca6635021c")}</label><div className="mailbox-credential-secret"><input ref={credentialInput} id="mailbox-current-password" type={credentialVisible ? 'text' : 'password'} value={credentialPassword} readOnly autoComplete="off" spellCheck={false} /><button type="button" className="mailbox-secondary" aria-label={credentialVisible ? t("m_dd1d07bd9c") : t("m_ffe21a6711")} onClick={() => setCredentialVisible(value => !value)}>{credentialVisible ? <EyeOff size={17} /> : <Eye size={17} />}</button><button type="button" className="mailbox-primary" onClick={() => void copyCredentials()}><Copy size={16} aria-hidden="true" />{t("m_c49aca3e41")}</button></div></div> : credentialMode === 'reveal' ? <form className="mailbox-form" onSubmit={revealCredentials}><label htmlFor="mailbox-verify-code">{t("m_2d60deda8e")}</label><input id="mailbox-verify-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={credentialCode} onChange={event => setCredentialCode(event.target.value.replace(/\D/g, ''))} required /><button className="mailbox-primary" disabled={credentialBusy || !credentialChallenge || credentialCode.length !== 6}>{t("m_e415f98712")}</button></form>
              : <form className="mailbox-form" onSubmit={changeCredentials}><label htmlFor="mailbox-change-code">{t("m_2d60deda8e")}</label><input id="mailbox-change-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={credentialCode} onChange={event => setCredentialCode(event.target.value.replace(/\D/g, ''))} required /><label htmlFor="mailbox-new-password">{t("m_5182344796")}</label><input id="mailbox-new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} required /><p className="mailbox-help">{t("m_6b808672e3")}</p><label htmlFor="mailbox-confirm-password">{t("m_6fde05a916")}</label><input id="mailbox-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /><button className="mailbox-primary" disabled={credentialBusy || !credentialChallenge || credentialCode.length !== 6 || !newPassword || newPassword !== confirmPassword}>{t("m_0ebec0f0e9")}</button></form>}
          </div>}
          {credentialMessage && <p className="mailbox-credential-status" role="status">{t(credentialMessage)}</p>}{credentialError && <p className="mailbox-error" role="alert">{t(credentialError)}</p>}
        </section>
        {!['pending','claimed','review'].includes(access.password_change_status || '') && <nav className="mailbox-view-tabs" aria-label={t("m_0fb2b9ea7c")}>
          <button type="button" aria-current={view === 'inbox' ? 'page' : undefined} onClick={() => changeView('inbox')}><Inbox size={17} aria-hidden="true" />{t("m_63a5e7b739")}</button>
          <button type="button" aria-current={view === 'sent' ? 'page' : undefined} onClick={() => changeView('sent')}><Send size={17} aria-hidden="true" />{t("m_60823aaec7")}</button>
          <button type="button" aria-current={view === 'compose' ? 'page' : undefined} onClick={() => changeView('compose')}><Mail size={17} aria-hidden="true" />{t("m_2ef8275490")}</button>
        </nav>}
        {!['pending','claimed','review'].includes(access.password_change_status || '') && view !== 'compose' && <section className="mailbox-panel mailbox-letters" aria-labelledby="mail-folder-title">
          <div className="mailbox-folder-head"><div><h2 id="mail-folder-title">{view === 'inbox' ? t("m_63a5e7b739") : t("m_60823aaec7")}</h2><p>{mailList ? t("m_3a5dc05e38", {v0: mailList.total}) : t("m_86b6d0d630")}</p></div>
            <button type="button" className="mailbox-secondary" onClick={() => void loadFolder(view, mailList?.page || 1)} disabled={mailLoading}><RefreshCw size={16} aria-hidden="true" />{t("m_aee8874341")}</button></div>
          {mailError && <p className="mailbox-error" role="alert">{t(mailError)}</p>}
          {mailLoading && mailList && <p className="mailbox-refresh-status" role="status">{t("m_3deb616d34")}</p>}
          {selected ? <article className="mailbox-letter-detail"><button type="button" className="mailbox-back" onClick={returnToList}><ArrowLeft size={16} aria-hidden="true" />{t("m_e9d5ca6c14")}</button>
            <h3>{selected.subject}</h3><dl><div><dt>{t("m_bae32961a3")}</dt><dd>{selected.from || t("m_4d8c1c5b42")}</dd></div><div><dt>{t("m_c237b665a6")}</dt><dd>{selected.to || t("m_4d8c1c5b42")}</dd></div><div><dt>{t("m_8b6ff49851")}</dt><dd>{selected.date ? new Date(selected.date).toLocaleString(locale,{timeZone:'Asia/Shanghai'}) : t("m_4d8c1c5b42")}</dd></div></dl>
            {selected.tooLarge ? <p className="mailbox-empty">{t("m_03750d0311")}</p> : <>
              <pre className="mailbox-letter-body">{selected.text || t("m_f0a22c359f")}</pre>
              {!!selected.attachments?.length && <p className="mailbox-attachment-note">{t("m_bfa49584f7")}{selected.attachments.map(item => item.filename).join('、')}{t("m_c172587668")}</p>}
            </>}
            {view === 'inbox' && selected.replyTo && <button type="button" className="mailbox-primary" onClick={() => { setTo(selected.replyTo || ''); setSubject(/^Re:/i.test(selected.subject) ? selected.subject : `Re: ${selected.subject}`); changeView('compose'); }}>{t("m_cf945e21dd")}</button>}
          </article> : mailLoading && !mailList ? <p className="mailbox-empty">{t("m_3deb616d34")}</p> : !mailList?.folderAvailable ? <p className="mailbox-empty">{t("m_d89b28a464")}</p> : !mailList.messages.length ? <p className="mailbox-empty">{view === 'inbox' ? t("m_1631539c78") : t("m_0c1879ca29")}</p> : <ul className="mailbox-letter-list">{mailList.messages.map(item => <li key={item.uid}><button type="button" disabled={mailLoading} onClick={() => void openMessage(item)} className={item.unread ? 'mailbox-letter-unread' : ''}>
            <span className="mailbox-letter-correspondent">{view === 'inbox' ? item.from : item.to}</span><span className="mailbox-letter-subject">{item.subject}</span><time>{item.date ? new Date(item.date).toLocaleString(locale,{timeZone:'Asia/Shanghai'}) : ''}</time></button></li>)}</ul>}
          {!selected && mailList && mailList.total > mailList.pageSize && <div className="mailbox-list-pages"><span>{t("m_af50a0fe2a")} {mailList.page}  {t("m_d24d3c9946")}</span><div><button type="button" className="mailbox-secondary" disabled={mailLoading || mailList.page <= 1} onClick={() => void loadFolder(view, mailList.page - 1)}>{t("m_c9b9ae7a61")}</button><button type="button" className="mailbox-secondary" disabled={mailLoading || mailList.page * mailList.pageSize >= mailList.total} onClick={() => void loadFolder(view, mailList.page + 1)}>{t("m_8a8542f696")}</button></div></div>}
        </section>}
        {!['pending','claimed','review'].includes(access.password_change_status || '') && view === 'compose' && <section className="mailbox-panel" aria-labelledby="mail-compose-title"><div className="mailbox-panel-head"><span className="mailbox-icon"><Send size={20} aria-hidden="true" /></span><div><h2 id="mail-compose-title">{t("m_2ef8275490")}</h2><p>{t("m_f4f0c2b190")}{access.mailbox_address}</p></div></div>
          <form onSubmit={send} className="mailbox-form"><label htmlFor="mail-to">{t("m_c237b665a6")}</label><input id="mail-to" type="email" value={to} onChange={event => setTo(event.target.value)} required placeholder="name@example.com" />
            <label htmlFor="mail-subject">{t("m_c3405f8c7d")}</label><input id="mail-subject" value={subject} onChange={event => setSubject(event.target.value)} required maxLength={120} />
            <label htmlFor="mail-body">{t("m_d661c3d96d")}</label><textarea id="mail-body" value={content} onChange={event => setContent(event.target.value)} rows={9} required maxLength={10000} />
            <div className="mailbox-form-footer"><p>{t("m_67b8fdfb4f")}</p><button className="mailbox-primary" disabled={busy}>{busy ? t("m_364970d816") : t("m_c268c1b1ce")}</button></div></form></section>}</>}
      {access?.status === 'active' && view === 'sent' && <details className="mailbox-panel mailbox-history" onToggle={event => { if (event.currentTarget.open && !historyLoaded.current) void refreshHistory(); }}><summary id="mail-history-title">{t("m_1ac3bf196d")}</summary><p className="mailbox-footnote">{t("m_7c5f13c106")}</p>
        {historyError && <p className="mailbox-error" role="alert">{historyError}<button type="button" className="mailbox-text-button" onClick={() => void refreshHistory()}>{t("m_621e17c543")}</button></p>}
        {historyLoading && <p role="status">{t("m_35ced93b32")}</p>}{sent.length === 0 ? <p className="mailbox-empty">{historyLoading ? "" : t("m_53224ee3db")}</p> : <ul>{sent.map(item => <li key={item.id}><div><strong>{item.subject}</strong><span>{item.recipient_email}</span></div><span>{item.status === 'accepted' ? t("m_60823aaec7") : item.status === 'uncertain' ? t("m_79989e841c") : item.status === 'sending' ? t("m_9eacfc58bf") : t("m_28384d7afd")}</span></li>)}</ul>}</details>}
    </>}
  </main>;
}
