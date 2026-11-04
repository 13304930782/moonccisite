import { AdminEmpty, AdminNotice } from './AdminState';
import { useI18n } from '../../i18n';
import { useEffect, useState } from 'react';
import { safeHref } from '../../lib/safeUrl';
import { api } from '../../lib/api';

type Item = { id: number; type: string; activity_id: string; title: string; excerpt: string; path: string; published_at: string; included: boolean };
export type NewsletterDraft = { period: { key: string; scheduledAt: string }; items: Item[]; editable: boolean };
const types: Record<string, string> = { post: '文章', update: '近况', release: '项目版本' };
export function NewsletterPreview({ data, reload }: { data: NewsletterDraft; reload: () => void }) {
  const { locale,  t } = useI18n();
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
      setMessage(value ? t("m_36d69598f6") : t("m_c1bbf9c78a"));
    } catch (e: any) {
      setError(e.message || t("m_f42a1238b4"));
      if (e.status === 409) reload();
    } finally { setBusy(''); }
  }
  return <>
    <div className="newsletter-draft-summary">
      <p>{t("m_c7f8eebc9b")} {new Date(data.period.scheduledAt).toLocaleString(locale, { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} {t("m_5eb76ad884")}</p>
      <p>{t("m_7ecf1cde64")} {count} / {data.items.length}  {t("m_5186bcf6e1")}</p>
    </div>
    {!data.editable && <AdminNotice kind="info">{t("m_8fc0f0e72f")}</AdminNotice>}
    {error && <AdminNotice>{t(error || '')}</AdminNotice>}
    <p className="newsletter-save-status" role="status">{busy ? t("m_ff509c9ba0") : message}</p>
    <div className="newsletter-draft-list">
      {data.items.map(item => <article key={item.activity_id} className={included(item) ? '' : 'newsletter-excluded'}>
        <div className="newsletter-draft-copy">
          <small>{t(types[item.type] || item.type)} · {new Date(item.published_at).toLocaleDateString(locale, { timeZone: 'Asia/Shanghai' })}</small>
          <h3><a href={safeHref(item.path)} target="_blank" rel="noopener noreferrer">{item.title}</a></h3>
          <p>{item.excerpt}</p>
        </div>
        <label className="newsletter-include">
          <input type="checkbox" checked={included(item)} disabled={!!busy || !data.editable} aria-label={t("m_933e757ce0", {v0: item.title})} onChange={event => void select(item, event.target.checked)} />
          <span>{included(item) ? t("m_edecf0ae6e") : t("m_b7321d609d")}</span>
        </label>
      </article>)}
    </div>
    {!data.items.length ? <div className="admin-empty-result"><AdminEmpty title={t("m_6fce66ae49")} /></div> : count === 0 && <AdminNotice kind="info">{t("m_0f80520bad")}</AdminNotice>}
  </>;
}
