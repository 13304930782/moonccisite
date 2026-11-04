import { useI18n } from '../i18n';
import {distinctArticleSummary} from '../lib/articleSummary';
import {useEffect,useMemo,useState,type CSSProperties,type ReactNode} from 'react';
import {isArticleOld,stripLegacyAgeNotice} from '../lib/articleAge';

import {Link} from './LocaleLink';
import { MarkdownContent, headingsFor } from './MarkdownContent';
import {SingleLine} from './DetailUI';
import {formatDate} from './ContentUI';
import {Eye,UserRound} from 'lucide-react';
import {ArticleTableOfContents} from './ArticleTableOfContents';
import {loadCoverGradient} from '../lib/coverPalette';
import { safeImageSrc } from '../lib/safeUrl';
import { dimensionsFor } from '../lib/imageDimensions';
import {CoverImage} from './CoverImage';
import {SiteBack} from './SiteBack';
import {coverFrame,normalizeCoverCrop} from '../lib/coverCrop';
import '../../styles/article-detail.css';
import {ArticleAiSummary} from './ArticleAiSummary';
export function ArticlePresentation({ post, preview = false, views = null,progress,languages }: { post: any; preview?: boolean; views?: number | null;progress?:ReactNode;languages?:ReactNode }) {
  const { t , formatDate} = useI18n();
  const content=stripLegacyAgeNotice(post?.content);
  const summary=distinctArticleSummary(stripLegacyAgeNotice(post?.summary),content);
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(timer);},[]);
  const old=isArticleOld(post.updated_at || post.published_at || post.created_at,now);
  const headings = useMemo(()=>headingsFor(content,2).filter(h=>h.level===2||h.level===3),[content]);
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
      <div className="detail-intro"><nav className="detail-breadcrumb" aria-label={t("m_6c3f7b6a12")} data-reading-ignore>{preview ? <Link className={cover?'hero-pill':'hero-pill--light'} to="/articles">{t("m_9bb68df2c1")}</Link> : <SiteBack className={cover?'hero-pill':'hero-pill--light'}/>}</nav><div className="detail-label"><Link className={cover?'hero-pill':'hero-pill--light'} to={post.category ? `/category/${encodeURIComponent(post.category)}` : '/articles'}>{post.category_display_name || post.category||t("m_7d5a89f6b1")}</Link></div></div>
      {languages}
      <h1 lang={post.content_locale||'zh-CN'} className="detail-title">{post.title}</h1>
      <SingleLine className="hero-meta" label={t("m_849fa6c202")}>
        <span className="g">
          {avatar?<img className="hero-meta-avatar" src={avatar} alt="" width={24} height={24}/>:<UserRound className="hero-meta-avatar" aria-hidden="true"/>}
          <span className="hero-meta-author">{post.author_name||t("m_7d4146ca08")}{Boolean(post.author_deleted)&&<small>{t("m_077a6d3771")}</small>}</span>
          {(preview||published)&&<time dateTime={published||undefined}>{preview?t("m_a67f09b3e8"):t("m_41e48aedb0", {v0: publishedLabel})}</time>}
        </span>
        {(showUpdated||showViews)&&<span className="g">
          {showUpdated&&<time dateTime={post.updated_at}>{t("m_7153f0918a")} {updatedLabel}</time>}
          {showViews&&<span className="article-view-count" aria-label={t("m_2d0e8195f4", {v0: views})} title={t("m_4a7ff85ddf")}><Eye size={15} aria-hidden="true"/><span>{(views??0).toLocaleString('zh-CN')}</span></span>}
        </span>}
      </SingleLine>
      {cover&&<div className="hero-card" data-default-focus={!framing||undefined}><CoverImage className="content-image" src={cover} frame={coverFrame(framing,'detail')} alt={post.title||t("m_af41581b41")} {...dimensionsFor(cover,post.image_dimensions)} fetchPriority="high"/></div>}
    </div></header>
    <div className="article-after"><div className="article-reading-wrap">
      <div className="detail-body" lang={post.content_locale || 'zh-CN'}>
        {old&&<p className="article-age-notice" role="note">{t("m_7b1f67bfb8")}</p>}
        {summary&&(post.summary_mode==='ai'&&!preview ? <ArticleAiSummary key={post.id} summary={summary}/> : <p className={`article-summary${post.summary_mode==='ai'?' article-summary--ai':''}`}>
          {post.summary_mode==='ai'&&<span className="article-summary-source"><span className="article-summary-deepseek" aria-hidden="true"/>{t("m_0c4c130b0c")}</span>}
          {summary}
        </p>)}
        <div lang={post.content_locale||'zh-CN'}><MarkdownContent content={content} headingPrefix="heading" minHeadingLevel={2} imageDimensions={post.image_dimensions}/></div>
        {tags.length>0&&<SingleLine className="detail-tags" label={t("m_28ac19be45")}>{tags.map((tag,index)=><Link key={tag} to={`/tag/${encodeURIComponent(tag)}`}>{post.tags_display?.[index] || tag}</Link>)}</SingleLine>}
      </div>
      <ArticleTableOfContents headings={headings} preview={preview}/>
    </div></div>
  </article>;
}
