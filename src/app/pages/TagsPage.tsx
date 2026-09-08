import { Link } from 'react-router-dom';
import { SitePage, PageHeading, ResourceState, useResource } from '../components/ContentUI';
export default function TagsPage() {
  const resource = useResource('/posts/meta/tags');
  return (
    <SitePage>
      <PageHeading eyebrow="INDEX" title="标签索引">
        <p>按主题探索文章。</p>
      </PageHeading>
      <ResourceState resource={resource}>
        <div className="project-grid">
          {(resource.data || []).map((item: any) => (
            <Link
              key={item.tag}
              className="project-card"
              to={` /tag/${encodeURIComponent(item.tag)}`.trim()}
            >
              <h3>{item.tag} ↗</h3>
              <p>{item.count} 篇文章</p>
            </Link>
          ))}
        </div>
        {resource.data?.length === 0 && <p className="quiet-state">暂无内容。</p>}
      </ResourceState>
    </SitePage>
  );
}
