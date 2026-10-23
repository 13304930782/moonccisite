import { articlePath } from '../../lib/articleUrl';
import { Link } from 'react-router-dom';
import { formatDate, labels, useResource } from '../ContentUI';
import { coverFrame } from '../../lib/coverCrop';
import { safeImageSrc, safeRoutePath } from '../../lib/safeUrl';
import { responsiveImage } from '../../lib/responsiveImage';
import { homeActivityText } from './activityText';
import '../../../styles/article-label.css';

type Activity = {
  activity_id: string;
  id: number;
  type: string;
  title: string;
  excerpt?: string;
  published_at: string;
  path: string;
};
type PostCover = { id: number; slug?: string; cover_image?: string; cover_crop?: unknown };
type HomePost = PostCover & { title: string; summary?: string; category?: string; tags?: string[]; updated_at?: string; published_at?: string; created_at?: string };

function HomeThumbnail({ post }: { post?: PostCover | null }) {
  const src = safeImageSrc(post?.cover_image);
  if (!src) return null;
  const frame = coverFrame(post?.cover_crop, 'card') || coverFrame(post?.cover_crop, 'detail');
  const position = frame ? `${frame.x * 100}% ${frame.y * 100}%` : '50% 30%';
  return <div className="home-activity-thumbnail">
    <img {...responsiveImage(src, false, frame?.zoom ?? 1)} alt="" width={168} height={105} loading="lazy" decoding="async"
      style={{ objectPosition: position, transform: frame && frame.zoom !== 1 ? `scale(${frame.zoom})` : undefined, transformOrigin: position }} />
  </div>;
}

function HomeActivityRow({ item, posts, postsLoading }: { item: Activity; posts: PostCover[]; postsLoading: boolean }) {
  const cached = item.type === 'post' ? posts.find(post => String(post.id) === String(item.id)) : undefined;
  // Activity has no cover fields. Reuse the homepage posts before requesting a missing article.
  const article = useResource<PostCover>(`/posts/${item.id}`, item.type === 'post' && !cached && !postsLoading);
  const post = cached || article.data;
  const text = homeActivityText(item);
  const titleId = `home-activity-${item.activity_id}-title`;
  return <Link to={item.type === 'post' && post ? articlePath(post) : safeRoutePath(item.path)} className="home-activity-row" aria-labelledby={titleId}>
    <div className="home-activity-copy">
      <div className="home-activity-meta">
        <span className="home-activity-label" data-type={item.type}>{labels[item.type] || '更新'}</span>
        <time dateTime={item.published_at}>{formatDate(item.published_at)}</time>
        {item.type === 'release' && <span>来自 GitHub Releases</span>}
      </div>
      <h3 className="home-activity-title" id={titleId}>{text.title}</h3>
      {text.excerpt && <p className="home-activity-excerpt">{text.excerpt}</p>}
    </div>
    {item.type === 'post' && <HomeThumbnail post={post} />}
  </Link>;
}

export function HomeActivityList({ items, posts, postsLoading }: { items: Activity[]; posts: PostCover[]; postsLoading: boolean }) {
  return <div className="home-activity-list">
    {items.length ? items.map(item => <HomeActivityRow key={item.activity_id} item={item} posts={posts} postsLoading={postsLoading} />)
      : <p className="quiet-state">还没有动态</p>}
  </div>;
}

export function HomePostList({ posts }: { posts: HomePost[] }) {
  return <div className="home-activity-list home-post-list">
    {posts.map(post => {
      const date = post.updated_at || post.published_at || post.created_at || null;
      const text = homeActivityText({ type: 'post', title: post.title, excerpt: post.summary });
      const titleId = `home-post-${post.id}-title`;
      return <Link key={post.id} to={articlePath(post)} className="home-activity-row home-post-row" aria-labelledby={titleId}>
        <div className="home-activity-copy">
          <div className="home-activity-meta">{post.category || (Array.isArray(post.tags) && post.tags.slice(0, 3).join(' / ')) || '文章'}</div>
          <h3 className="home-activity-title" id={titleId}>{text.title}</h3>
          {text.excerpt && <p className="home-activity-excerpt">{text.excerpt}</p>}
          <time className="home-post-date" dateTime={date || undefined}>更新于 {formatDate(date)}</time>
        </div>
        <HomeThumbnail post={post} />
      </Link>;
    })}
  </div>;
}
