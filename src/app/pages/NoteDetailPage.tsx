import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SitePage, ResourceState, useResource, formatDate } from '../components/ContentUI';
import { SiteBack } from '../components/SiteBack';
import { usePreviousSiteVisit } from '../components/RoutePosition';
import { CommentSection } from '../components/CommentSection';
import { MarkdownContent } from '../components/MarkdownContent';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { safeImageSrc } from '../lib/safeUrl';
import { notify } from '../lib/feedback';
import '../../styles/note-v2.css';

export function noteText(value: string) {
  return value.replace(/```[\s\S]*?```/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, '')
    .replace(/(^|\n)\s{0,3}(?:#{1,6}|>|[-*+] |\d+\. )/g, ' ')
    .replace(/~~/g, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
}

export function relativeNoteDate(value: string, now = Date.now()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const calendar = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric' });
  const dayNumber = (value: Date) => {
    const parts = Object.fromEntries(calendar.formatToParts(value).map(part => [part.type, part.value]));
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86400000;
  };
  const days = dayNumber(date) - dayNumber(new Date(now));
  const formatter = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });
  return Math.abs(days) < 30 ? formatter.format(days, 'day')
    : Math.abs(days) < 365 ? formatter.format(Math.trunc(days / 30), 'month')
    : formatter.format(Math.trunc(days / 365), 'year');
}

export default function NoteDetailPage() {
  const { id } = useParams();
  const resource = useResource(`/updates/${id}`);
  return <SitePage className="note-v2"><ResourceState resource={resource}>
    {resource.data && <NoteReading key={id} item={resource.data} />}
  </ResourceState></SitePage>;
}

function NoteReading({ item }: { item: any }) {
  const previous = usePreviousSiteVisit();
  const { data: settings } = useSiteSettings();
  const latest = useResource('/activity?type=update&pageSize=3');
  const [count, setCount] = useState(0);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const content = String(item.content || '');
  const text = noteText(content);
  const short = [...content].length <= 80 && !/[\n\r]/.test(content) && content.trim() === text;
  const siteName = settings?.brand?.site_title?.trim() || 'mooncci';
  const author = item.author_name || settings?.brand?.nav_title || siteName;
  const avatar = safeImageSrc(item.author_avatar || settings?.brand?.logo_url);
  const more = (latest.data?.items || []).filter((entry: any) => String(entry.id) !== String(item.id)).slice(0, 2);
  const title = `${[...text].slice(0, 20).join('')} · 近况 · ${siteName}`;
  useEffect(() => {
    // Shared route metadata can arrive later; this page owns its content title.
    const apply = () => { if (document.title !== title) document.title = title; };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.origin + window.location.pathname); notify.success('已复制'); }
    catch { notify.error('复制失败，请复制地址栏中的链接。'); }
  }
  function discuss() {
    const section = document.getElementById(`comments-update-${item.id}`);
    section?.scrollIntoView({ block: 'start', behavior: 'auto' });
    section?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  }
  return <div className="note-v2-content">
    <h1 className="note-v2-title">{text || '近况'}</h1>
    <div className="note-v2-top">{previous ? <SiteBack className="note-v2-back" /> : <Link className="note-v2-back" to="/updates?type=update">← 返回</Link>}<span className="note-v2-kind">近况</span></div>
    <article className="note-v2-card" aria-label={`${author}的近况`} data-reading-content>
      <header className="note-v2-author">
        {avatar && !avatarFailed ? <img src={avatar} alt="" width="44" height="44" onError={() => setAvatarFailed(true)} /> : <span className="note-v2-avatar" aria-hidden="true">{[...author][0]}</span>}
        <div><div className="note-v2-name"><strong>{author}</strong><span className="note-v2-role">站长</span></div>
          <time dateTime={item.published_at} title={new Date(item.published_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}>{relativeNoteDate(item.published_at)} · {formatDate(item.published_at)}</time></div>
      </header>
      <div className={`note-v2-body${short ? ' note-v2-short' : ''}`}>
        {short ? <p>{content}</p> : <MarkdownContent content={content} />}
        {safeImageSrc(item.image_url) && <img className="note-v2-image" src={safeImageSrc(item.image_url)} alt="近况配图" />}
      </div>
      <div className="note-v2-actions" data-reading-ignore><button type="button" onClick={() => void copyLink()}>复制链接</button><button type="button" onClick={discuss}>讨论 {count} ↓</button></div>
    </article>
    {more.length > 0 && <section className="note-v2-more" aria-labelledby="note-v2-more-title">
      <div className="note-v2-section-heading"><h2 id="note-v2-more-title">更多近况</h2><Link to="/updates?type=update">全部 →</Link></div>
      <div className="note-v2-more-grid">{more.map((entry: any) => <Link key={entry.id} to={`/updates/${entry.id}`} className="note-v2-more-card"><time dateTime={entry.published_at}>{formatDate(entry.published_at)}</time><p>{noteText(String(entry.excerpt || ''))}</p></Link>)}</div>
    </section>}
    <CommentSection updateId={item.id} variant="note" onCountChange={setCount} />
    <div className="note-v2-bottom"><Link to="/updates?type=update">查看全部近况 →</Link></div>
  </div>;
}
