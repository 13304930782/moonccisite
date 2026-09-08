import { useSearchParams, useParams, Link } from 'react-router-dom';
import {
  SitePage,
  PageHeading,
  ActivityList,
  ResourceState,
  Pagination,
  SubscribeForm,
  useResource,
  formatDate,
} from '../components/ContentUI';
import { MarkdownContent } from '../components/MarkdownContent';
import { safeImageSrc } from '../lib/safeUrl';
export default function UpdatesPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1),
    type = params.get('type') || '';
  const resource = useResource(`/activity?page=${page}&type=${encodeURIComponent(type)}`);
  return (
    <SitePage>
      <PageHeading eyebrow="JOURNAL" title="最近更新">
        <p>文章、近况，以及作品向前走的一小步。</p>
      </PageHeading>
      <nav className="filter-tabs" aria-label="更新类型">
        {[
          ['', '全部'],
          ['post', '文章'],
          ['update', '近况'],
          ['release', '项目版本'],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={type === key}
            onClick={() => setParams({ type: key, page: '1' })}
          >
            {label}
          </button>
        ))}
      </nav>
      <ResourceState resource={resource}>
        {resource.data && (
          <>
            <ActivityList items={resource.data.items} />
            <Pagination data={resource.data} onPage={(p) => setParams({ type, page: String(p) })} />
          </>
        )}
      </ResourceState>
      <SubscribeForm />
    </SitePage>
  );
}
export function UpdateDetailPage() {
  const { id } = useParams(),
    resource = useResource(`/updates/${id}`);
  return (
    <SitePage narrow>
      <Link to="/updates" className="text-link">
        ← 最近更新
      </Link>
      <ResourceState resource={resource}>
        {resource.data && (
          <article>
            <PageHeading eyebrow="NOTE" title="一则近况">
              <time>{formatDate(resource.data.published_at)}</time>
            </PageHeading>
            <MarkdownContent content={resource.data.content} />
            {safeImageSrc(resource.data.image_url) && (
              <img
                className="content-image"
                src={safeImageSrc(resource.data.image_url)}
                alt="动态配图"
              />
            )}
          </article>
        )}
      </ResourceState>
      <SubscribeForm />
    </SitePage>
  );
}
