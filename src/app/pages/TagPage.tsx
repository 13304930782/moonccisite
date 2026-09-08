import { Link, useParams } from "react-router-dom";
import { PageHeading, SitePage } from "../components/ContentUI";
import { PostResults } from "../components/PostResults";
export default function TagPage() {
  const { tag = "" } = useParams();
  return (
    <SitePage>
      <Link className="text-link" to="/tags">
        ← 全部标签
      </Link>
      <PageHeading eyebrow="TAG" title={tag} />
      <PostResults
        path={`/posts?tag=${encodeURIComponent(tag)}`}
        empty="这个标签下还没有文章。"
      />
    </SitePage>
  );
}
