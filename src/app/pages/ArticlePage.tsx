import {ReadingProgress} from '../components/ReadingProgress';
import '../../styles/engagement.css';
import {ArticleSeries} from '../components/ArticleSeries';
import {ArticleDiscovery} from '../components/ArticleDiscovery';
import {usePageView} from '../components/PageAnalytics';
import {ArticlePresentation} from '../components/ArticlePresentation';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { articlePath } from '../lib/articleUrl';
import { CommentSection } from '../components/CommentSection';
import {
  SitePage,
  ResourceState,
  SubscribeForm,
  useResource,
} from '../components/ContentUI';
export default function ArticlePage() {
  const { id } = useParams(),
    resource = useResource(`/posts/${encodeURIComponent(id || '')}`);
  const location = useLocation(), navigate = useNavigate();
  const post = resource.data;
  useEffect(() => {
    if (post?.status !== 'published') return;
    const canonical = articlePath(post);
    if (location.pathname !== canonical) navigate(canonical + location.search + location.hash, {replace:true});
  }, [post?.id,post?.slug,post?.status,location.pathname,location.search,location.hash,navigate]);
  const views=usePageView(post?.id?`/article/${post.id}`:null,post?.id);
  return (
    <SitePage detail className="article-route" footerContent={post&&<SubscribeForm />}>
      <ResourceState resource={resource}>
        {post && (
          <>
            <div className="article-layout">
              <ArticlePresentation post={post} views={views} progress={<ReadingProgress key={post.id} postId={post.id}/>}/>
              <ArticleSeries id={post.id}/><ArticleDiscovery key={post.id} id={post.id} slug={post.slug} title={post.title}/><CommentSection postId={post.id} />
            </div>
          </>
        )}
      </ResourceState>
    </SitePage>
  );
}
