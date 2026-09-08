import { Link } from 'react-router-dom';
import { PageHeading, SitePage } from '../components/ContentUI';
import { PostResults } from '../components/PostResults';
export default function ArticlesPage() {
  return (
    <SitePage>
      <PageHeading eyebrow="WRITING" title="文章">
        <p>关于技术、构建过程与实践中的思考。</p>
        <div className="inline-actions">
          <Link className="text-link" to="/categories">
            按分类浏览 ↗
          </Link>
          <Link className="text-link" to="/tags">
            按标签浏览 ↗
          </Link>
        </div>
      </PageHeading>
      <PostResults path="/posts" />
    </SitePage>
  );
}
