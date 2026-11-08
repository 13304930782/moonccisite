import { ArticleLoading } from '../components/ArticleLoading';
import {ReadingProgress} from '../components/ReadingProgress';
import '../../styles/engagement.css';
import {ArticleSeries} from '../components/ArticleSeries';
import {ArticleDiscovery} from '../components/ArticleDiscovery';
import {usePageView} from '../components/PageAnalytics';
import {ArticlePresentation} from '../components/ArticlePresentation';
import {ArticleLanguages} from '../components/ArticleLanguages';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import {useLocale} from '../context/LocaleContext';
import {localizedPath} from '../lib/locale';
import { articlePath } from '../lib/articleUrl';
import { CommentSection } from '../components/CommentSection';
import {
  SitePage,
  ResourceState,
  SubscribeForm,
  useResource,
} from '../components/ContentUI';
export default function ArticlePage() {
  const {contentLocale} = useLocale();
  const { id } = useParams(),
    resource = useResource(`/posts/${encodeURIComponent(id || '')}`);
  const location = useLocation(), navigate = useNavigate();
  const post = resource.data;
  useEffect(() => {
    if (post?.status !== 'published') return;
    const canonical = articlePath(post,contentLocale);
    if (localizedPath(location.pathname,contentLocale) !== canonical) navigate(canonical + location.search + location.hash, {replace:true});
  }, [post?.id,post?.slug,post?.status,contentLocale,location.pathname,location.search,location.hash,navigate]);
  const identity = useRef<{slug?:string;id?:number}>({});
  if (identity.current.slug !== id) identity.current = {slug:id};
  if (post?.id) identity.current.id = post.id;
  const postId = identity.current.id;
  const views=usePageView(postId?`/article/${postId}`:null,postId);
  return (
    <SitePage detail className="article-route" footerContent={post&&<SubscribeForm />}>
      <ResourceState resource={resource} loadingContent={<ArticleLoading />}>
        {post && (
          <>
            <div className="article-layout">
              <ArticlePresentation post={post} languages={<ArticleLanguages post={post}/>} views={views} progress={<ReadingProgress key={post.id} postId={post.id}/>}/>
              <ArticleSeries id={post.id}/><ArticleDiscovery key={post.id} id={post.id} slug={post.slug} title={post.title}/><CommentSection postId={post.id} />
            </div>
          </>
        )}
      </ResourceState>
    </SitePage>
  );
}
