import { useI18n } from '../i18n';
import '../../styles/content-discovery.css';
import { useParams } from "react-router-dom";
import { PageHeading, SitePage } from "../components/ContentUI";
import { PostResults } from "../components/PostResults";
export default function TagPage() {
  const { t } = useI18n();
  const { tag = "" } = useParams();
  return (
    <SitePage className="discovery-page">
      <PageHeading eyebrow="TAG" title={tag} />
      <PostResults
        path={`/posts?tag=${encodeURIComponent(tag)}`}
        empty={t("m_e4bf7f1684")}
      />
    </SitePage>
  );
}
