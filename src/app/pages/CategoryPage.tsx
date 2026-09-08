import { Link, useParams } from "react-router-dom";
import { PageHeading, SitePage } from "../components/ContentUI";
import { PostResults } from "../components/PostResults";
export default function CategoryPage() {
  const { category = "" } = useParams();
  return (
    <SitePage>
      <Link className="text-link" to="/categories">
        ← 全部分类
      </Link>
      <PageHeading eyebrow="CATEGORY" title={category} />
      <PostResults
        path={`/posts?category=${encodeURIComponent(category)}`}
        empty="这个分类下还没有文章。"
      />
    </SitePage>
  );
}
