import { Link } from 'react-router-dom';
import { SitePage, PageHeading } from '../components/ContentUI';
export default function NotFoundPage() {
  return <SitePage narrow><PageHeading eyebrow="404" title="这个页面没有找到"><p>链接可能已经失效，也可以从文章列表重新查找。</p></PageHeading><div className="inline-actions"><Link className="neo-button" to="/articles">浏览文章</Link><Link className="text-link" to="/">返回首页</Link></div></SitePage>;
}
