import {useEffect,useState} from 'react';
import {isArticleOld,stripLegacyAgeNotice} from '../lib/articleAge';
import { Link } from 'react-router-dom';
import { MarkdownContent, headingsFor } from './MarkdownContent';
import { DetailPage, DetailMeta, EmptyState, SingleLine } from './DetailUI';
import { safeImageSrc } from '../lib/safeUrl';
export function ArticlePresentation({ post, preview = false, views = null }: { post: any; preview?: boolean; views?: number | null }) {
  const content=stripLegacyAgeNotice(post?.content);
  const summary=stripLegacyAgeNotice(post?.summary);
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(timer);},[]);
  const old=isArticleOld(post.published_at,now);
  const headings = headingsFor(content);
  let tags: string[] = [];
  try { tags = Array.isArray(post.tags) ? post.tags : JSON.parse(post.tags || '[]'); } catch {}
  return <DetailPage className={`article-presentation ${preview ? 'detail-preview' : ''}`} backTo="/articles" backLabel="文章库" title={post.title} preview={preview}
    label={post.category || '文章'}
    meta={<DetailMeta author={post.author_name || '作者'} avatar={post.author_avatar} deleted={Boolean(post.author_deleted)}
      date={post.published_at || post.created_at} dateLabel={preview ? '预览 · 未发布' : undefined} views={preview ? null : views} category={post.category} />}
    asideClassName="article-toc" asideTitle="本文目录"
    aside={headings.length ? <nav aria-label="文章目录">{headings.map(h => <a key={h.id} href={`#${h.id}`} style={{ paddingLeft: (h.level - 1) * 8 }}>{h.title}</a>)}</nav> : <EmptyState>本文暂无目录</EmptyState>}>
    {old&&<p className="article-age-notice" role="note">提醒：本文发布已满半年，部分信息可能已发生变化，请结合最新情况参考。</p>}
    {summary && <p className="article-summary">{summary}</p>}
    {safeImageSrc(post.cover_image) && <img className="content-image" src={safeImageSrc(post.cover_image)} alt="" />}
    <MarkdownContent content={content} headingPrefix="heading" />
    {tags.length > 0 && <SingleLine className="detail-tags" label="文章标签">{tags.map(tag => <Link key={tag} to={`/tag/${encodeURIComponent(tag)}`}>{tag}</Link>)}</SingleLine>}
  </DetailPage>;
}
