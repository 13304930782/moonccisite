import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { api } from '../lib/api';
import '../../styles/mailbox.css';

type Status = 'pending' | 'provisioning' | 'active' | 'rejected' | 'revoked' | 'all';
type Request = { user_id: number; username: string; account_email: string; requested_local_part: string; reason: string;
  status: Exclude<Status, 'all'>; mailbox_address: string | null; review_note: string | null; created_at: string };
type Result = { requests: Request[]; counts: Record<string, number>; total: number; page: number; limit: number };
const tabs: { value: Status; label: string }[] = [
  { value: 'pending', label: '待审核' }, { value: 'provisioning', label: '开通待核对' },
  { value: 'active', label: '已开通' }, { value: 'rejected', label: '未通过' },
  { value: 'revoked', label: '已停用' }, { value: 'all', label: '全部' },
];
const label = (status: Status) => tabs.find(tab => tab.value === status)?.label || status;

export default function AdminMailboxRequestsPage() {
  const [status, setStatus] = useState<Status>('pending');
  const [searchText, setSearchText] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [confirm, setConfirm] = useState<{ ids: number[]; action: 'approve' | 'reject' | 'revoke' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const params = new URLSearchParams({ status, page: String(page) });
    if (query) params.set('q', query);
    const data: Result = await api(`/mailboxes/admin/requests?${params}`);
    setResult(data); setSelected([]);
  }, [status, query, page]);
  useEffect(() => { setLoading(true); load().catch(error => setNotice(error.message || '申请列表加载失败。')).finally(() => setLoading(false)); }, [load]);
  const chooseStatus = (next: Status) => { setStatus(next); setPage(1); setConfirm(null); setSelected([]); };
  const search = (event: FormEvent) => { event.preventDefault(); setQuery(searchText.trim()); setPage(1); setConfirm(null); };
  const toggle = (id: number) => setSelected(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const pending = result?.requests.filter(item => item.status === 'pending') || [];
  const allPendingSelected = pending.length > 0 && pending.every(item => selected.includes(item.user_id));
  const act = async () => {
    if (!confirm) return;
    setBusy(true); setNotice('');
    try {
      if (confirm.ids.length > 1 && confirm.action !== 'revoke') {
        const response = await api(`/mailboxes/admin/requests/batch-${confirm.action}`, { method: 'POST', body: JSON.stringify({ ids: confirm.ids, dailyLimit: 10 }) });
        setNotice(response.message);
      } else {
        const endpoint = `/mailboxes/admin/requests/${confirm.ids[0]}/${confirm.action}`;
        const response = await api(endpoint, { method: 'POST', body: JSON.stringify(confirm.action === 'approve' ? { dailyLimit: 10 } : {}) });
        setNotice(response.message);
      }
      setConfirm(null); await load();
    } catch (error: any) { setNotice(error.message || '操作失败，请刷新后重试。'); await load().catch(() => {}); }
    finally { setBusy(false); }
  };
  const confirmItems = confirm?.ids.map(id => result?.requests.find(item => item.user_id === id)).filter(Boolean) as Request[] | undefined;
  return <main className="mailbox-review-page">
    <header className="mailbox-heading"><div><p className="mailbox-eyebrow">mooncci / MAIL</p><h1>邮箱申请审核</h1>
      <p>先处理待审核申请；搜索、状态筛选和分页用于管理较大的申请队列。</p></div>
      <Link className="mailbox-review-link" to="/admin/mailbox"><ArrowLeft size={16} aria-hidden="true" />返回发邮件</Link></header>
    {notice && <p role="status" aria-live="polite" className="mailbox-notice">{notice}</p>}
    <nav className="mailbox-review-tabs" aria-label="申请状态">{tabs.map(tab => <button key={tab.value} type="button" aria-current={status === tab.value ? 'page' : undefined}
      onClick={() => chooseStatus(tab.value)}>{tab.label}<span>{tab.value === 'all' ? Object.values(result?.counts || {}).reduce((sum, count) => sum + count, 0) : result?.counts?.[tab.value] || 0}</span></button>)}</nav>
    <section className="mailbox-panel mailbox-review-panel" aria-label="邮箱申请列表">
      <div className="mailbox-review-toolbar"><form onSubmit={search} role="search"><label className="sr-only" htmlFor="mailbox-review-search">搜索申请</label>
        <Search size={17} aria-hidden="true" /><input id="mailbox-review-search" value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="搜索用户名、邮箱或地址" />
        <button className="mailbox-secondary">搜索</button></form><button className="mailbox-secondary" type="button" onClick={() => void load().catch(error => setNotice(error.message))}><RefreshCw size={16} aria-hidden="true" />刷新</button></div>
      {selected.length > 0 && <div className="mailbox-selection-bar"><span>已选择 {selected.length} 项</span>
        <button className="mailbox-primary" disabled={busy} onClick={() => setConfirm({ ids: selected, action: 'approve' })}>批准并开通</button>
        <button className="mailbox-secondary" disabled={busy} onClick={() => setConfirm({ ids: selected, action: 'reject' })}>拒绝</button>
        <button className="mailbox-text-button" onClick={() => setSelected([])}>清除选择</button></div>}
      {confirm && <div className="mailbox-confirm" role="group" aria-label="确认审核操作"><strong>{confirm.action === 'approve' ? `确认批准 ${confirm.ids.length} 项申请？` : confirm.action === 'reject' ? `确认拒绝 ${confirm.ids.length} 项申请？` : '确认停用网页发信权限？'}</strong>
        <p>{confirm.action === 'approve' ? '批准后会进入邮局开通队列，每个邮箱每日发送上限为 10 次。' : confirm.action === 'revoke' ? '只撤销网站发信权限，宝塔邮箱账号需单独管理。' : '被拒绝的用户可以修改后重新申请。'}</p>
        <p className="mailbox-confirm-addresses">{confirmItems?.map(item => `${item.requested_local_part}@mooncci.site`).join('、')}</p>
        <div><button className="mailbox-primary" disabled={busy} onClick={() => void act()}>{busy ? '处理中…' : '确认操作'}</button><button className="mailbox-secondary" disabled={busy} onClick={() => setConfirm(null)}>取消</button></div></div>}
      {loading ? <p className="mailbox-empty">正在读取申请…</p> : !result?.requests.length ? <p className="mailbox-empty">当前筛选条件下暂无申请。</p> : <>
        <div className="mailbox-review-table-head"><div>{pending.length > 0 && <input type="checkbox" aria-label="选择当前页待审核申请" checked={allPendingSelected}
          onChange={() => setSelected(allPendingSelected ? [] : pending.map(item => item.user_id))} />}</div><span>申请地址 / 用户</span><span>用途</span><span>状态 / 时间</span><span>操作</span></div>
        <div className="mailbox-review-rows">{result.requests.map(item => <article className="mailbox-review-row" key={item.user_id}>
          <div className="mailbox-review-check">{item.status === 'pending' && <input type="checkbox" aria-label={`选择 ${item.requested_local_part}@mooncci.site`} checked={selected.includes(item.user_id)} onChange={() => toggle(item.user_id)} />}</div>
          <div className="mailbox-review-identity"><strong>{item.requested_local_part}@mooncci.site</strong><span>{item.username} · {item.account_email}</span></div>
          <p title={item.reason}>{item.reason}</p><div className="mailbox-review-meta"><span className="mailbox-review-status">{label(item.status)}</span><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString('zh-CN')}</time></div>
          <div className="mailbox-review-actions">{item.status === 'pending' && <><button type="button" onClick={() => setConfirm({ ids: [item.user_id], action: 'approve' })}>批准</button><button type="button" onClick={() => setConfirm({ ids: [item.user_id], action: 'reject' })}>拒绝</button></>}
            {item.status === 'active' && <button type="button" onClick={() => setConfirm({ ids: [item.user_id], action: 'revoke' })}>停用发信</button>}</div>
        </article>)}</div></>}
      <footer className="mailbox-review-pagination"><span>共 {result?.total || 0} 项 · 第 {result?.page || 1} 页</span><div><button className="mailbox-secondary" disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} aria-hidden="true" />上一页</button>
        <button className="mailbox-secondary" disabled={!result || page * result.limit >= result.total} onClick={() => setPage(value => value + 1)}>下一页<ChevronRight size={16} aria-hidden="true" /></button></div></footer>
    </section>
  </main>;
}
