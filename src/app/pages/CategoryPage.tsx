import '../../styles/content-discovery.css';
import { useParams } from "react-router-dom";
import { PageHeading, SitePage } from "../components/ContentUI";
import { PostResults } from "../components/PostResults";
export default function CategoryPage() {
  const { category = "" } = useParams();
  return (
    <SitePage className="discovery-page">
      <PageHeading eyebrow="CATEGORY" title={category} />
      <PostResults
        path={`/posts?category=${encodeURIComponent(category)}`}
        empty="这个分类下还没有文章。"
      />
    </SitePage>
  );
}
