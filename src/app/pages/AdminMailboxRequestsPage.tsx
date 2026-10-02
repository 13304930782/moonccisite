import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { api } from '../lib/api';
import '../../styles/mailbox.css';

type Status = 'pending' | 'provisioning' | 'active' | 'rejected' | 'revoked' | 'all';
type Request = { user_id: number; username: string; account_email: string; requested_local_part: string; reason: string;
  status: Exclude<Status, 'all'>; mailbox_address: string | null; daily_limit: number; review_note: string | null; created_at: string };
type Result = { requests: Request[]; counts: Record<string, number>; total: number; page: number; limit: number };
const tabs: { value: Status; label: string }[] = [
  { value: 'all', label: '全部' }, { value: 'pending', label: '待审核' }, { value: 'provisioning', label: '开通待核对' },
  { value: 'active', label: '已开通' }, { value: 'rejected', label: '未通过' },
  { value: 'revoked', label: '已停用' },
];
const label = (status: Status) => tabs.find(tab => tab.value === status)?.label || status;

export default function AdminMailboxRequestsPage() {
  const [status, setStatus] = useState<Status>('all');
  const [searchText, setSearchText] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [confirm, setConfirm] = useState<{ ids: number[]; action: 'approve' | 'reject' | 'revoke' | 'limit' } | null>(null);
  const [limitInput, setLimitInput] = useState('10');
  const [unlimited, setUnlimited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const confirmRef = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    const params = new URLSearchParams({ status, page: String(page) });
    if (query) params.set('q', query);
    const data: Result = await api(`/mailboxes/admin/requests?${params}`);
    setResult(data); setSelected([]);
  }, [status, query, page]);
  useEffect(() => { setLoading(true); load().catch(error => setNotice(error.message || '申请列表加载失败。')).finally(() => setLoading(false)); }, [load]);
  useEffect(() => { if (confirm) confirmRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [confirm]);
  const chooseStatus = (next: Status) => { setStatus(next); setPage(1); setConfirm(null); setSelected([]); };
  const search = (event: FormEvent) => { event.preventDefault(); setQuery(searchText.trim()); setPage(1); setConfirm(null); };
  const toggle = (id: number) => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const pending = result?.requests.filter(item => item.status === 'pending') || [];
  const allPendingSelected = pending.length > 0 && pending.every(item => selected.includes(item.user_id));
  const openApproval = (ids: number[]) => { setLimitInput('10'); setUnlimited(false); setConfirm({ ids, action: 'approve' }); };
  const openLimit = (item: Request) => { setLimitInput(String(item.daily_limit || 10)); setUnlimited(item.daily_limit === 0); setConfirm({ ids: [item.user_id], action: 'limit' }); };
  const act = async () => {
    if (!confirm) return;
    const dailyLimit = unlimited ? 0 : Number(limitInput);
    if ((confirm.action === 'approve' || confirm.action === 'limit') && (!Number.isInteger(dailyLimit) || dailyLimit < 0 || dailyLimit > 1000 || (!unlimited && dailyLimit < 1))) {
      setNotice('请输入 1–1000 的每日额度，或选择“不设上限”。'); return;
    }
    setBusy(true); setNotice('');
    try {
      if (confirm.ids.length > 1 && confirm.action !== 'revoke') {
        const response = await api(`/mailboxes/admin/requests/batch-${confirm.action}`, { method: 'POST', body: JSON.stringify({ ids: confirm.ids, dailyLimit }) });
        setNotice(response.message);
      } else {
        const endpoint = `/mailboxes/admin/requests/${confirm.ids[0]}/${confirm.action}`;
        const response = await api(endpoint, { method: 'POST', body: JSON.stringify(confirm.action === 'approve' || confirm.action === 'limit' ? { dailyLimit } : {}) });
        setNotice(response.message);
      }
      setConfirm(null); await load();
    } catch (error: any) { setNotice(error.message || '操作失败，请刷新后重试。'); await load().catch(() => {}); }
    finally { setBusy(false); }
  };
  const confirmItems = confirm?.ids.map(id => result?.requests.find(item => item.user_id === id)).filter(Boolean) as Request[] | undefined;
  return <main className="mailbox-review-page">
    <header className="mailbox-heading"><div><p className="mailbox-eyebrow">mooncci / MAIL</p><h1>邮箱申请与权限</h1>
      <p>审核新申请，管理已开通邮箱的发信额度与权限。</p></div>
      <Link className="mailbox-review-link" to="/admin/mailbox"><ArrowLeft size={16} aria-hidden="true" />返回发邮件</Link></header>
    {notice && <p role="status" aria-live="polite" className="mailbox-notice">{notice}</p>}
    <nav className="mailbox-review-tabs" aria-label="申请状态">{tabs.map(tab => <button key={tab.value} type="button" aria-current={status === tab.value ? 'page' : undefined}
      onClick={() => chooseStatus(tab.value)}>{tab.label}<span>{tab.value === 'all' ? Object.values(result?.counts || {}).reduce((sum, count) => sum + count, 0) : result?.counts?.[tab.value] || 0}</span></button>)}</nav>
    <section className="mailbox-panel mailbox-review-panel" aria-label="邮箱申请列表">
      <div className="mailbox-review-toolbar"><form onSubmit={search} role="search"><label className="sr-only" htmlFor="mailbox-review-search">搜索申请</label>
        <Search size={17} aria-hidden="true" /><input id="mailbox-review-search" value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="搜索用户名、邮箱或地址" />
        <button className="mailbox-secondary">搜索</button></form><button className="mailbox-secondary" type="button" onClick={() => void load().catch(error => setNotice(error.message))}><RefreshCw size={16} aria-hidden="true" />刷新</button></div>
      {selected.length > 0 && <div className="mailbox-selection-bar"><span>已选择 {selected.length} 项</span>
        <button className="mailbox-primary" disabled={busy} onClick={() => openApproval(selected)}>批准并开通</button>
        <button className="mailbox-secondary" disabled={busy} onClick={() => setConfirm({ ids: selected, action: 'reject' })}>拒绝</button>
        <button className="mailbox-text-button" onClick={() => setSelected([])}>清除选择</button></div>}
      {confirm && <div ref={confirmRef} className="mailbox-confirm" role="group" aria-label="确认审核操作"><strong>{confirm.action === 'approve' ? `确认批准 ${confirm.ids.length} 项申请？` : confirm.action === 'reject' ? `确认拒绝 ${confirm.ids.length} 项申请？` : confirm.action === 'limit' ? '设置每日发信额度' : '确认停用网页发信权限？'}</strong>
        <p>{confirm.action === 'approve' ? '批准后会进入邮局开通队列。' : confirm.action === 'limit' ? '新额度保存后立即用于网站发信。' : confirm.action === 'revoke' ? '只撤销网站发信权限，宝塔邮箱账号需单独管理。' : '被拒绝的用户可以修改后重新申请。'}</p>
        <p className="mailbox-confirm-addresses">{confirmItems?.map(item => `${item.requested_local_part}@mooncci.site`).join('、')}</p>
        {(confirm.action === 'approve' || confirm.action === 'limit') && <div className="mailbox-limit-editor"><label htmlFor="mailbox-daily-limit">每日发信上限</label><input id="mailbox-daily-limit" type="number" min="1" max="1000" step="1" inputMode="numeric" value={limitInput} disabled={unlimited || busy} onChange={event => setLimitInput(event.target.value)} /><span>封</span><label className="mailbox-unlimited"><input type="checkbox" checked={unlimited} disabled={busy} onChange={event => setUnlimited(event.target.checked)} />不设上限</label></div>}
        <div><button className="mailbox-primary" disabled={busy} onClick={() => void act()}>{busy ? '处理中…' : '确认操作'}</button><button className="mailbox-secondary" disabled={busy} onClick={() => setConfirm(null)}>取消</button></div></div>}
      {loading ? <p className="mailbox-empty">正在读取申请…</p> : !result?.requests.length ? <div className="mailbox-review-empty"><strong>{query ? '没有找到匹配的邮箱' : status === 'pending' ? '目前没有待审核申请' : '暂无邮箱申请'}</strong>
        <p>{query ? '可以调整搜索词，或切换状态查看。' : status === 'pending' ? '新的申请会出现在这里。' : '申请提交后会显示在此列表。'}</p>
        {status === 'pending' && (result?.counts.active || 0) > 0 && <button type="button" className="mailbox-secondary" onClick={() => chooseStatus('active')}>查看已开通邮箱</button>}</div> : <>
        <div className="mailbox-review-table-head"><label className="mailbox-review-check">{pending.length > 0 && <input type="checkbox" aria-label="选择当前页待审核申请" checked={allPendingSelected}
          onChange={() => setSelected(allPendingSelected ? [] : pending.map(item => item.user_id))} />}</label><span>申请地址 / 用户</span><span>用途</span><span>状态 / 时间</span><span>操作</span></div>
        <div className="mailbox-review-rows">{result.requests.map(item => <article className="mailbox-review-row" key={item.user_id}>
          <label className="mailbox-review-check">{item.status === 'pending' && <input type="checkbox" aria-label={`选择 ${item.requested_local_part}@mooncci.site`} checked={selected.includes(item.user_id)} onChange={() => toggle(item.user_id)} />}</label>
          <div className="mailbox-review-identity"><strong>{item.requested_local_part}@mooncci.site</strong><span>{item.username} · {item.account_email}</span></div>
          <p title={item.reason}>{item.reason}</p><div className="mailbox-review-meta"><span className="mailbox-review-status">{label(item.status)}</span>{item.status === 'active' && <span>{item.daily_limit === 0 ? '不设上限' : `每日 ${item.daily_limit} 封`}</span>}<time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString('zh-CN')}</time></div>
          <div className="mailbox-review-actions">{item.status === 'pending' && <><button type="button" onClick={() => openApproval([item.user_id])}>批准</button><button type="button" onClick={() => setConfirm({ ids: [item.user_id], action: 'reject' })}>拒绝</button></>}
            {item.status === 'active' && <><button type="button" onClick={() => openLimit(item)}>设置额度</button><button type="button" onClick={() => setConfirm({ ids: [item.user_id], action: 'revoke' })}>停用发信</button></>}</div>
        </article>)}</div></>}
      {!loading && !!result && result.total > result.limit && <footer className="mailbox-review-pagination"><span>共 {result.total} 项 · 第 {result.page} 页</span><div><button className="mailbox-secondary" disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} aria-hidden="true" />上一页</button>
        <button className="mailbox-secondary" disabled={page * result.limit >= result.total} onClick={() => setPage(value => value + 1)}>下一页<ChevronRight size={16} aria-hidden="true" /></button></div></footer>}
    </section>
  </main>;
}
