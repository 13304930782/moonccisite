import {Link} from 'react-router-dom';
import {useState} from 'react';
import {MarkdownContent,headingsFor} from './MarkdownContent';
import {formatDate} from './ContentUI';
import {safeImageSrc} from '../lib/safeUrl';
export function ArticlePresentation({post,preview=false}:{post:any;preview?:boolean}) {
 const [tocOpen,setTocOpen]=useState(()=>window.matchMedia('(min-width:1280px)').matches);
 const headings=headingsFor(post?.content||'');
 let tags:string[]=[];try{tags=Array.isArray(post.tags)?post.tags:JSON.parse(post.tags||'[]');}catch{}
 return (<article className="article-presentation" data-reading-content={preview?undefined:true}>
                <Link className="text-link" to="/articles">
                  ← 文章库
                </Link>
                <div className="inline-actions">
                  {tags.map((tag) => (
                    <Link className="eyebrow" key={tag} to={`/tag/${encodeURIComponent(tag)}`}>
                      {tag}
                    </Link>
                  ))}
                </div>
                <h1 className="article-title">{post.title}</h1>
                <div className="inline-actions muted">
                  <span className="inline-flex items-center gap-2">{post.author_avatar && <img src={post.author_avatar} alt="" className="h-7 w-7 rounded-full object-cover"/>}{post.author_name || '作者'}{post.author_deleted && <small className="deleted-account-label">已删除</small>}</span>
                  <time>{preview?'预览 · 未发布':formatDate(post.published_at || post.created_at)}</time>
                  {post.category && (
                    <Link to={`/category/${encodeURIComponent(post.category)}`}>
                      {post.category}
                    </Link>
                  )}
                </div>
                {post.summary && <p className="article-summary">{post.summary}</p>}
                {safeImageSrc(post.cover_image) && (
                  <img className="content-image" src={safeImageSrc(post.cover_image)} alt="" />
                )}
                {headings.length >= 3 && (
                  <details
                    className="article-toc" data-reading-ignore
                    open={tocOpen}
                    onToggle={(e) => setTocOpen(e.currentTarget.open)}
                  >
                    <summary>本文目录</summary>
                    <nav aria-label="文章目录">
                      {headings.map((h) => (
                        <a key={h.id} href={`#${h.id}`} style={{ paddingLeft: (h.level - 1) * 8 }}>
                          {h.title}
                        </a>
                      ))}
                    </nav>
                  </details>
                )}
                <MarkdownContent content={post.content || ''} headingPrefix="heading" />
              </article>);
}
