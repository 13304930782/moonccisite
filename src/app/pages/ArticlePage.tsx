import {usePageView} from '../components/PageAnalytics';
import {ArticlePresentation} from '../components/ArticlePresentation';
import { useParams } from 'react-router-dom';
import { CommentSection } from '../components/CommentSection';
import {
  SitePage,
  ResourceState,
  SubscribeForm,
  useResource,
} from '../components/ContentUI';
export default function ArticlePage() {
  const { id } = useParams(),
    resource = useResource(`/posts/${id}`);
  const post = resource.data;
  const views=usePageView(post?.id?`/article/${post.id}`:null,post?.id);
  return (
    <SitePage>
      <ResourceState resource={resource}>
        {post && (
          <>
            <div className="article-layout">
              <ArticlePresentation post={post} views={views}/>
              <CommentSection postId={post.id} />
            </div>
            <SubscribeForm />
          </>
        )}
      </ResourceState>
    </SitePage>
  );
}
