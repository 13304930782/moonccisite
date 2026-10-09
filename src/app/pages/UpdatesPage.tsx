import { notify } from '../lib/feedback';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, FileText, GitBranch } from 'lucide-react';
import '../../styles/update-journal.css';
import { CommentSection } from '../components/CommentSection';
import { useSearchParams, useParams } from 'react-router-dom';
import {
  SitePage,
  PageHeading,
  ResourceState,
  Pagination,
  useResource,
  formatDate,
} from '../components/ContentUI';
import { MarkdownContent } from '../components/MarkdownContent';
import { safeImageSrc } from '../lib/safeUrl';
export default function UpdatesPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1),
    type = params.get('type') || '';
  const resource = useResource(`/activity?page=${page}&type=${encodeURIComponent(type)}`);
  return (
    <SitePage>
      <div className="update-journal update-feed">
      <PageHeading eyebrow="JOURNAL" title="最近更新">
        <p>文章、近况，以及作品的更新</p>
      </PageHeading>
      <nav className="filter-tabs" aria-label="更新类型">
        {[
          ['', '全部'],
          ['post', '文章'],
          ['update', '近况'],
          ['release', '项目版本'],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={type === key}
            onClick={() => setParams({ type: key, page: '1' })}
          >
            {label}
          </button>
        ))}
      </nav>
      <ResourceState resource={resource}>
        {resource.data && (
          <>
            <UpdateTimeline key={`${type}-${page}`} items={resource.data.items} />
            <Pagination data={resource.data} onPage={(p) => setParams({ type, page: String(p) })} />
          </>
        )}
      </ResourceState>
      </div>
    </SitePage>
  );
}
function UpdateTimeline({items}: {items: any[]}) {
  // The API orders the complete result before pagination by published_at DESC.
  // Preserve that order here so page boundaries and type filters stay consistent.
  return <div className="journal-feed" aria-label="按时间从新到旧排列的更新">
    {!items.length && <p className="quiet-state">暂时没有更新。</p>}
    {items.map(item => <TimelineEntry key={item.activity_id} item={item}/>)}
  </div>;
}
function TimelineEntry({item}: {item: any}) {
  const [discussion, setDiscussion] = useState(false);
  const [fullText, setFullText] = useState(false);
  const date = formatDate(item.published_at);
  const isUpdate = item.type === 'update';
  const label = isUpdate ? '近况' : item.type === 'post' ? '文章' : '项目版本';
  const TypeIcon = isUpdate ? MessageCircle : item.type === 'post' ? FileText : GitBranch;
  const text = String(item.excerpt || '');
  const longText = text.length > 240 || text.split('\n').length > 5;
  return <div className="journal-timeline journal-feed-row">
    <aside className="journal-date"><time dateTime={item.published_at}>{date.slice(5).replace('/', '月')}日</time><span>{date.slice(0,4)} · {label}</span></aside>
    <article className={`journal-entry journal-entry--${isUpdate ? 'update' : item.type === 'post' ? 'post' : 'release'}`}>
      <div className="journal-feed-content">
        <div className="journal-kind-row"><span className="journal-kind"><TypeIcon size={14} aria-hidden="true"/>{label}</span>{item.type === 'release' && <><span className="journal-kind-source">GitHub Releases</span>{Number(item.prerelease) === 1 && <span className="release-prerelease">预发布</span>}</>}</div>
        {!isUpdate && <h2><Link to={item.path}>{item.title}</Link></h2>}
        <p id={`activity-text-${item.activity_id}`} className={`journal-feed-text${longText && !fullText ? ' journal-feed-text--clamped' : ''}`}>{text}</p>
        {longText && <button className="comment-expand" aria-expanded={fullText} aria-controls={`activity-text-${item.activity_id}`} onClick={() => setFullText(!fullText)}>{fullText ? '收起正文' : '展开正文'}</button>}
      </div>
      <div className="journal-actions">
        <Link to={item.path}>{isUpdate ? '查看近况' : item.type === 'post' ? '阅读全文' : '查看版本'} <span className="journal-link-arrow" aria-hidden="true">↗</span></Link>
        {isUpdate && <button aria-expanded={discussion} aria-controls={`activity-discussion-${item.id}`} onClick={() => setDiscussion(!discussion)}><MessageCircle size={16}/>{discussion ? '收起讨论' : '展开讨论'}</button>}
      </div>
      {isUpdate && <div id={`activity-discussion-${item.id}`} hidden={!discussion}>{discussion && <CommentSection updateId={item.id} compact />}</div>}
    </article>
  </div>;
}
export function UpdateDetailPage() {
  const { id } = useParams();
  const resource = useResource(`/updates/${id}`);
  const item = resource.data;
  return <SitePage><ResourceState resource={resource}>{item && <UpdateReading key={id} item={item}/>}</ResourceState></SitePage>;
}
function UpdateReading({item}: {item: any}) {
  const [copyMessage, setCopyMessage] = useState('');
  async function copyLink() {
    try { await navigator.clipboard.writeText(window.location.origin + window.location.pathname); notify.success('链接已复制'); }
    catch { setCopyMessage('复制失败，请复制地址栏中的链接。'); notify.error('复制失败，请复制地址栏中的链接。'); }
  }
  return <div className="update-reading">
    <article aria-labelledby="update-reading-title" data-reading-content>
      <header className="update-reading-header">
        <div className="update-reading-intro"><Link className="journal-back" to="/updates">← 最近更新</Link><span className="journal-eyebrow">近况</span></div>
        <h1 id="update-reading-title">{item.title || '一则近况'}</h1>
        <div className="update-reading-meta">{item.author_name && <span>{item.author_name}</span>}<time dateTime={item.published_at}>{formatDate(item.published_at)}</time></div>
      </header>
      <div className="update-reading-body">
        <MarkdownContent content={item.content}/>
        {safeImageSrc(item.image_url) && <img className="content-image" src={safeImageSrc(item.image_url)} alt="动态配图"/>}
      </div>
      <div className="journal-actions update-reading-actions" data-reading-ignore>
        <a href={`#comments-update-${item.id}`}>参与讨论 ↓</a>
        <button type="button" onClick={() => void copyLink()}>复制链接 ↗</button>
        <span role="status">{copyMessage}</span>
      </div>
    </article>
    <CommentSection updateId={item.id} compact />
  </div>;
}
