import {usePublishing} from '../lib/usePublishing';
import { Link } from 'react-router-dom';
import { SitePage } from '../components/ContentUI';
import { PostResults } from '../components/PostResults';
import { SiteBack } from '../components/SiteBack';
import '../../styles/articles-v2.css';
export default function ArticlesPage() {
 const publishing=usePublishing();
  return (
    <SitePage className="articles-v2">
      <header className="articles-heading">
        <SiteBack className="articles-back" />
        <h1>文章</h1>
        <p>关于技术、构建过程与实践中的思考。</p>
      </header>
      <nav className="articles-browse" aria-label="文章浏览方式">
        <p>浏览文章</p>
        <div>
          {publishing && <Link to="/series">按专栏浏览 <span aria-hidden="true">↗</span></Link>}
          <Link to="/categories">按分类浏览 <span aria-hidden="true">↗</span></Link>
          <Link to="/tags">按标签浏览 <span aria-hidden="true">↗</span></Link>
        </div>
      </nav>
      <section className="articles-list" aria-label="文章列表">
        <PostResults path="/posts" />
      </section>
    </SitePage>
  );
}
