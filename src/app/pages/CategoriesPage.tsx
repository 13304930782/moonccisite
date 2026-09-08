import { Link } from 'react-router-dom';
import { SitePage, PageHeading, ResourceState, useResource } from '../components/ContentUI';
export default function CategoriesPage() {
  const resource = useResource('/posts/meta/categories');
  return (
    <SitePage>
      <PageHeading eyebrow="INDEX" title="内容分类">
        <p>按主题探索文章。</p>
      </PageHeading>
      <ResourceState resource={resource}>
        <div className="project-grid">
          {(resource.data || []).map((item: any) => (
            <Link
              key={item.category}
              className="project-card"
              to={` /category/${encodeURIComponent(item.category)}`.trim()}
            >
              <h3>{item.category} ↗</h3>
              <p>{item.count} 篇文章</p>
            </Link>
          ))}
        </div>
        {resource.data?.length === 0 && <p className="quiet-state">暂无内容。</p>}
      </ResourceState>
    </SitePage>
  );
}
