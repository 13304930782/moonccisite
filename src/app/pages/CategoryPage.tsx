import { useI18n } from '../i18n';
import '../../styles/content-discovery.css';
import { useParams } from "react-router-dom";
import { PageHeading, SitePage } from "../components/ContentUI";
import { PostResults } from "../components/PostResults";
export default function CategoryPage() {
  const { t } = useI18n();
  const { category = "" } = useParams();
  return (
    <SitePage className="discovery-page">
      <PageHeading eyebrow="CATEGORY" title={category} />
      <PostResults
        path={`/posts?category=${encodeURIComponent(category)}`}
        empty={t("m_ae3e8effe3")}
      />
    </SitePage>
  );
}
