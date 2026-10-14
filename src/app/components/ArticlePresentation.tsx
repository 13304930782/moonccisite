import {distinctArticleSummary} from '../lib/articleSummary';
import {useEffect,useMemo,useState,type CSSProperties,type ReactNode} from 'react';
import {isArticleOld,stripLegacyAgeNotice} from '../lib/articleAge';
import { Link } from 'react-router-dom';
import { MarkdownContent, headingsFor } from './MarkdownContent';
import {SingleLine} from './DetailUI';
import {formatDate} from './ContentUI';
import {Eye,UserRound} from 'lucide-react';
import {ArticleTableOfContents} from './ArticleTableOfContents';
import {loadCoverGradient} from '../lib/coverPalette';
import { safeImageSrc } from '../lib/safeUrl';
import { dimensionsFor } from '../lib/imageDimensions';
import {CoverImage} from './CoverImage';
import {coverFrame,normalizeCoverCrop} from '../lib/coverCrop';
import '../../styles/article-detail.css';
export function ArticlePresentation({ post, preview = false, views = null,progress }: { post: any; preview?: boolean; views?: number | null;progress?:ReactNode }) {
  const content=stripLegacyAgeNotice(post?.content);
  const summary=distinctArticleSummary(stripLegacyAgeNotice(post?.summary),content);
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(timer);},[]);
  const old=isArticleOld(post.updated_at || post.published_at || post.created_at,now);
  const headings = useMemo(()=>headingsFor(content).filter(h=>h.level===2||h.level===3),[content]);
  const cover=safeImageSrc(post.cover_image),[palette,setPalette]=useState<{src:string;value:string}|null>(null);
  useEffect(()=>cover?loadCoverGradient(cover,value=>setPalette({src:cover,value})):undefined,[cover]);
  useEffect(()=>{if(!preview)window.dispatchEvent(new Event('mooncci:article-rail-ready'));return()=>{if(!preview)window.dispatchEvent(new Event('mooncci:article-rail-ready'));};},[preview,headings.length]);
  const bandStyle=palette?.src===cover?{'--band-bg':palette.value} as CSSProperties:undefined;
  const published=post.published_at||post.created_at,publishedLabel=formatDate(published);
  const updatedLabel=!preview&&post.updated_at?formatDate(post.updated_at):'';
  const showUpdated=Boolean(updatedLabel&&updatedLabel!==publishedLabel),showViews=!preview&&views!==null&&views>0;
  const avatar=safeImageSrc(post.author_avatar);
  const framing=normalizeCoverCrop(post.cover_crop);
  let tags: string[] = [];
  try { tags = Array.isArray(post.tags) ? post.tags : JSON.parse(post.tags || '[]'); } catch {}
  return <article className={`article-presentation ${cover?'article-has-cover':'article-no-cover'} ${preview?'detail-preview':''}`} data-reading-content={preview?undefined:true}>
    {progress}
    <header className={cover?'hero-band':'hero-heading'} style={cover?bandStyle:undefined}><div className="hero-inner">
      <div className="detail-intro"><nav className="detail-breadcrumb" aria-label="面包屑导航" data-reading-ignore><Link className={cover?'hero-pill':'hero-pill--light'} to="/articles">← 文章库</Link></nav><div className="detail-label"><Link className={cover?'hero-pill':'hero-pill--light'} to={`/category/${encodeURIComponent(post.category||'文章')}`}>{post.category||'文章'}</Link></div></div>
      <h1 className="detail-title">{post.title}</h1>
      <SingleLine className="hero-meta" label="发布信息">
        <span className="g">
          {avatar?<img className="hero-meta-avatar" src={avatar} alt="" width={24} height={24}/>:<UserRound className="hero-meta-avatar" aria-hidden="true"/>}
          <span className="hero-meta-author">{post.author_name||'作者'}{Boolean(post.author_deleted)&&<small>已删除</small>}</span>
          {(preview||published)&&<time dateTime={published||undefined}>{preview?'预览 · 未发布':`发布于 ${publishedLabel}`}</time>}
        </span>
        {(showUpdated||showViews)&&<span className="g">
          {showUpdated&&<time dateTime={post.updated_at}>更新于 {updatedLabel}</time>}
          {showViews&&<span className="article-view-count" aria-label={`${views} 次阅读`} title="阅读量"><Eye size={15} aria-hidden="true"/><span>{(views??0).toLocaleString('zh-CN')}</span></span>}
        </span>}
      </SingleLine>
      {cover&&<div className="hero-card" data-default-focus={!framing||undefined}><CoverImage className="content-image" src={cover} frame={coverFrame(framing,'detail')} alt={post.title||'文章封面'} {...dimensionsFor(cover,post.image_dimensions)} fetchPriority="high"/></div>}
    </div></header>
    <div className="article-after"><div className="article-reading-wrap">
      <div className="detail-body">
        {old&&<p className="article-age-notice" role="note">提醒：本文距最后更新已满半年，部分信息可能已发生变化，请结合最新情况参考。</p>}
        {summary&&<p className="article-summary">{summary}</p>}
        <MarkdownContent content={content} headingPrefix="heading" imageDimensions={post.image_dimensions}/>
        {tags.length>0&&<SingleLine className="detail-tags" label="文章标签">{tags.map(tag=><Link key={tag} to={`/tag/${encodeURIComponent(tag)}`}>{tag}</Link>)}</SingleLine>}
      </div>
      <ArticleTableOfContents headings={headings} preview={preview}/>
    </div></div>
  </article>;
}
