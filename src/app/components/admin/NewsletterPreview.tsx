import { useEffect, useState } from 'react';
import { safeHref } from '../../lib/safeUrl';
import { api } from '../../lib/api';

type Item = { id: number; type: string; activity_id: string; title: string; excerpt: string; path: string; published_at: string; included: boolean };
export type NewsletterDraft = { period: { key: string; scheduledAt: string }; items: Item[]; editable: boolean };
const types: Record<string, string> = { post: '文章', update: '近况', release: '项目版本' };
export function NewsletterPreview({ data, reload }: { data: NewsletterDraft; reload: () => void }) {
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setSaved({}); }, [data]);
  const included = (item: Item) => saved[item.activity_id] ?? item.included;
  const count = data.items.filter(included).length;
  async function select(item: Item, value: boolean) {
    setBusy(item.activity_id); setError(''); setMessage('');
    try {
      await api('/admin/newsletter/selection', { method: 'PUT', body: JSON.stringify({ weekStart: data.period.key, type: item.type, id: item.id, included: value }) });
      setSaved(current => ({ ...current, [item.activity_id]: value }));
      setMessage(value ? '已加入本期' : '本期不发送');
    } catch (e: any) {
      setError(e.message || '保存失败，请重试');
      if (e.status === 409) reload();
    } finally { setBusy(''); }
  }
  return <>
    <div className="newsletter-draft-summary">
      <p>计划发送：{new Date(data.period.scheduledAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}（北京时间）</p>
      <p>已选 {count} / {data.items.length} 条 · 取消勾选即保存，仅影响本期。</p>
    </div>
    {!data.editable && <p role="status">本期已开始投递，不能再修改。</p>}
    {error && <p role="alert">{error}</p>}
    <p className="newsletter-save-status" role="status">{busy ? '保存中…' : message}</p>
    <div className="newsletter-draft-list">
      {data.items.map(item => <article key={item.activity_id} className={included(item) ? '' : 'newsletter-excluded'}>
        <div className="newsletter-draft-copy">
          <small>{types[item.type] || item.type} · {new Date(item.published_at).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}</small>
          <h3><a href={safeHref(item.path)} target="_blank" rel="noopener noreferrer">{item.title}</a></h3>
          <p>{item.excerpt}</p>
        </div>
        <label className="newsletter-include">
          <input type="checkbox" checked={included(item)} disabled={!!busy || !data.editable} aria-label={`发送：${item.title}`} onChange={event => void select(item, event.target.checked)} />
          <span>{included(item) ? '发送' : '不发送'}</span>
        </label>
      </article>)}
    </div>
    {!data.items.length ? <p>暂无新内容，本期不发送。</p> : count === 0 && <p>已全部取消，本期不发送。</p>}
  </>;
}
