import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import { MarkdownContent, headingsFor } from '../components/MarkdownContent';
import { CommentSection } from '../components/CommentSection';
import {
  SitePage,
  ResourceState,
  SubscribeForm,
  useResource,
  formatDate,
} from '../components/ContentUI';
import { safeImageSrc } from '../lib/safeUrl';
export default function ArticlePage() {
  const { id } = useParams(),
    resource = useResource(`/posts/${id}`);
  const [tocOpen, setTocOpen] = useState(() => window.matchMedia('(min-width:1280px)').matches);
  const post = resource.data;
  const headings = headingsFor(post?.content || '');
  let tags: string[] = [];
  try {
    tags = Array.isArray(post?.tags) ? post.tags : JSON.parse(post?.tags || '[]');
  } catch {}
  return (
    <SitePage>
      <ResourceState resource={resource}>
        {post && (
          <>
            <div className="article-layout">
              <article>
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
                  <time>{formatDate(post.published_at || post.created_at)}</time>
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
                    className="article-toc"
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
              </article>
              <CommentSection postId={post.id} />
            </div>
            <SubscribeForm />
          </>
        )}
      </ResourceState>
    </SitePage>
  );
}
