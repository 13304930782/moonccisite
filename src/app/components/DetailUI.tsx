import { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, MessageCircle, UserRound } from 'lucide-react';
import { formatDate } from './ContentUI';
import { safeImageSrc } from '../lib/safeUrl';
import '../../styles/detail.css';

/** Horizontal information stays atomic; overflow scrolls inside the row. */
export function SingleLine({ children, className = '', label }: { children: ReactNode; className?: string; label: string }) {
  return <div className={`single-line ${className}`} role="group" aria-label={label} tabIndex={0}>{children}</div>;
}

export function DetailMeta({ author, avatar, deleted, date, dateLabel, views, category }: {
  author?: string; avatar?: string; deleted?: boolean; date?: string; dateLabel?: string; views?: number | null; category?: string;
}) {
  return <SingleLine className="detail-meta" label="发布信息">
    {author && <span className="detail-author">{safeImageSrc(avatar) ? <img src={safeImageSrc(avatar)} alt="" /> : <UserRound className="detail-avatar" aria-hidden="true" />}<span>{author}</span>{deleted && <small>已删除</small>}</span>}
    {(dateLabel || date) && <time dateTime={date || undefined}>{dateLabel || formatDate(date!)}</time>}
    {views != null && <span className="article-view-count" aria-label={`${views} 次阅读`} title="阅读量"><Eye size={15} aria-hidden="true" /><span>{views.toLocaleString('zh-CN')}</span></span>}
    {category && <Link to={`/category/${encodeURIComponent(category)}`}>{category}</Link>}
  </SingleLine>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="content-empty"><MessageCircle size={20} aria-hidden="true" /><p>{children}</p></div>;
}

function DetailAside({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 1100px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1100px)');
    const change = () => setOpen(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return <aside className="detail-aside" data-reading-ignore>
    <details className={`detail-panel ${className}`} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>{title}</summary><div className="detail-panel-content">{children}</div>
    </details>
  </aside>;
}

export function DetailPage({ className = '', backTo, backLabel, label, title, meta, children, aside, asideTitle = '本页目录', asideClassName, preview = false }: {
  className?: string; backTo: string; backLabel: string; label: ReactNode; title: string; meta: ReactNode; children: ReactNode;
  aside?: ReactNode; asideTitle?: string; asideClassName?: string; preview?: boolean;
}) {
  return <article className={`detail-page ${className}`} data-reading-content={preview ? undefined : true}>
    <header className="detail-header">
      <nav className="detail-breadcrumb" aria-label="面包屑导航" data-reading-ignore><Link className="text-link" to={backTo}>← {backLabel}</Link></nav>
      <div className="detail-label"><span className="detail-category">{label}</span></div>
      <h1 className="detail-title">{title}</h1>
      {meta}
    </header>
    <div className="detail-body">{children}</div>
    {aside && <DetailAside title={asideTitle} className={asideClassName}>{aside}</DetailAside>}
  </article>;
}
