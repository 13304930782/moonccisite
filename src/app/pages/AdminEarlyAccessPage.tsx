import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Search, UserRoundCheck } from 'lucide-react';
import { api } from '../lib/api';

const statusText: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
};

const occupationText: Record<string, string> = {
  student: '学生',
  teacher: '教师',
  developer: '开发者',
  creator: '创作者',
  enterprise: '企业用户',
  other: '其他',
};

export default function AdminEarlyAccessPage() {
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState('pending');
  const [keyword, setKeyword] = useState('');
  const [activeKeyword, setActiveKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = () => {
    setLoading(true);
    const query = new URLSearchParams({ status, page: String(page) });
    if (activeKeyword) query.set('keyword', activeKeyword);

    api(`/admin/early-access?${query}`)
      .then((data) => {
        setItems(Array.isArray(data.items) ? data.items : []);
        setTotal(Number(data.total || 0));
      })
      .catch((error) => setMessage(error.message || '申请加载失败。'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [status, page, activeKeyword]);

  const search = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setActiveKeyword(keyword.trim());
  };

  const totalPages = Math.max(1, Math.ceil(total / 30));

  return (
    <div>
      <div className="flex flex-col gap-6 border-2 border-black bg-white p-6 shadow-[7px_7px_0_#000] md:p-8">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <span className="neo-kicker bg-[#ffe17c]">PromptDock / Owner only</span>
            <h1 className="neo-heading mt-6 text-4xl md:text-5xl">Early Access 审核</h1>
            <p className="mt-4 text-sm font-bold text-black/55">查看申请资料、邮件状态并执行明确的批准或拒绝。</p>
          </div>
          <div className="flex h-14 w-14 items-center justify-center border-2 border-black bg-[#b7c6c2] shadow-[4px_4px_0_#000]">
            <UserRoundCheck className="h-7 w-7" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[180px_1fr]">
          <label className="font-black">
            状态
            <select
              value={status}
              onChange={(event) => { setStatus(event.target.value); setPage(1); }}
              className="neo-input mt-2 w-full px-4 py-3 outline-none"
            >
              <option value="pending">待审核</option>
              <option value="approved">已通过</option>
              <option value="rejected">已拒绝</option>
              <option value="all">全部</option>
            </select>
          </label>
          <form onSubmit={search} className="font-black">
            <label htmlFor="early-access-search">搜索姓名或邮箱</label>
            <div className="mt-2 flex gap-3">
              <input id="early-access-search" value={keyword} onChange={(event) => setKeyword(event.target.value)} className="neo-input min-w-0 flex-1 px-4 py-3 outline-none" />
              <button type="submit" className="neo-button neo-button-dark shrink-0"><Search className="h-4 w-4" />搜索</button>
            </div>
          </form>
        </div>

        {message && <div role="alert" className="border-2 border-black bg-[#ffe17c] px-4 py-3 font-bold">{message}</div>}
      </div>

      <div className="mt-8 space-y-4">
        {loading && <div className="border-2 border-black bg-white p-6 font-bold shadow-[4px_4px_0_#000]">正在加载申请…</div>}
        {!loading && items.length === 0 && <div className="border-2 border-black bg-white p-6 font-bold shadow-[4px_4px_0_#000]">暂无符合条件的申请。</div>}

        {items.map((item) => (
          <Link
            key={item.id}
            to={`/admin/early-access/${item.id}`}
            className="group flex flex-col justify-between gap-5 border-2 border-black bg-white p-5 shadow-[5px_5px_0_#000] transition hover:translate-x-1 hover:translate-y-1 hover:shadow-none md:flex-row md:items-center"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-xs font-black">#{item.id}</span>
                <span className={`border-2 border-black px-2.5 py-1 text-xs font-black ${item.status === 'pending' ? 'bg-[#ffe17c]' : item.status === 'approved' ? 'bg-[#b7c6c2]' : 'bg-white'}`}>
                  {statusText[item.status] || item.status}
                </span>
                {item.owner_notification_error && !item.owner_notification_sent_at && (
                  <span className="border-2 border-black bg-red-100 px-2.5 py-1 text-xs font-black">owner 通知失败</span>
                )}
                {item.approval_email_error && !item.approval_email_sent_at && (
                  <span className="border-2 border-black bg-red-100 px-2.5 py-1 text-xs font-black">通过邮件失败</span>
                )}
              </div>
              <h2 className="neo-heading mt-4 truncate text-2xl">{item.name}</h2>
              <p className="mt-2 truncate text-sm font-bold text-black/55">{item.email} · {occupationText[item.occupation] || item.occupation} · {item.macos_version}</p>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <span className="font-mono text-xs font-bold text-black/45">{item.created_at?.slice(0, 16).replace('T', ' ')}</span>
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        ))}
      </div>

      {!loading && totalPages > 1 && (
        <div className="mt-8 flex items-center justify-between border-2 border-black bg-[#ffe17c] p-4 shadow-[4px_4px_0_#000]">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="neo-button bg-white disabled:opacity-40">上一页</button>
          <span className="font-mono text-sm font-black">{page} / {totalPages} · {total} 份申请</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="neo-button bg-white disabled:opacity-40">下一页</button>
        </div>
      )}
    </div>
  );
}
