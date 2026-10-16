import { Link } from 'react-router-dom';
import { formatDate, labels, useResource } from '../ContentUI';
import { coverFrame } from '../../lib/coverCrop';
import { safeImageSrc, safeRoutePath } from '../../lib/safeUrl';
import { homeActivityText } from './activityText';

type Activity = {
  activity_id: string;
  id: number;
  type: string;
  title: string;
  excerpt?: string;
  published_at: string;
  path: string;
};
type PostCover = { id: number; cover_image?: string; cover_crop?: unknown };

function HomeActivityRow({ item, posts, postsLoading }: { item: Activity; posts: PostCover[]; postsLoading: boolean }) {
  const cached = item.type === 'post' ? posts.find(post => String(post.id) === String(item.id)) : undefined;
  // Activity has no cover fields. Reuse the homepage posts before requesting a missing article.
  const article = useResource<PostCover>(`/posts/${item.id}`, item.type === 'post' && !cached && !postsLoading);
  const post = cached || article.data;
  const src = item.type === 'post' ? safeImageSrc(post?.cover_image) : '';
  const frame = coverFrame(post?.cover_crop, 'card') || coverFrame(post?.cover_crop, 'detail');
  const position = frame ? `${frame.x * 100}% ${frame.y * 100}%` : '50% 30%';
  const text = homeActivityText(item);
  const titleId = `home-activity-${item.activity_id}-title`;
  return <Link to={safeRoutePath(item.path)} className="home-activity-row" aria-labelledby={titleId}>
    <div className="home-activity-copy">
      <div className="home-activity-meta">
        <span className="home-activity-label" data-type={item.type}>{labels[item.type] || '更新'}</span>
        <time dateTime={item.published_at}>{formatDate(item.published_at)}</time>
        {item.type === 'release' && <span>来自 GitHub Releases</span>}
      </div>
      <h3 className="home-activity-title" id={titleId}>{text.title}</h3>
      {text.excerpt && <p className="home-activity-excerpt">{text.excerpt}</p>}
    </div>
    {src && <div className="home-activity-thumbnail">
      <img src={src} alt="" width={168} height={105} loading="lazy" decoding="async"
        style={{ objectPosition: position, transform: frame && frame.zoom !== 1 ? `scale(${frame.zoom})` : undefined, transformOrigin: position }} />
    </div>}
  </Link>;
}

export function HomeActivityList({ items, posts, postsLoading }: { items: Activity[]; posts: PostCover[]; postsLoading: boolean }) {
  return <div className="home-activity-list">
    {items.length ? items.map(item => <HomeActivityRow key={item.activity_id} item={item} posts={posts} postsLoading={postsLoading} />)
      : <p className="quiet-state">还没有动态</p>}
  </div>;
}
