import { useI18n } from '../i18n';
import '../../styles/content-discovery.css';

import {Link} from '../components/LocaleLink';
import { SitePage, PageHeading, ResourceState, useResource } from '../components/ContentUI';
export default function TagsPage() {
  const { t } = useI18n();
  const resource = useResource('/posts/meta/tags');
  return (
    <SitePage className="discovery-page">
      <PageHeading eyebrow="INDEX" title={t("m_02b344b2b4")}>
        <p>{t("m_1442263c42")}</p>
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
              <p>{item.count}  {t("m_9f115826f3")}</p>
            </Link>
          ))}
        </div>
        {resource.data?.length === 0 && <p className="quiet-state">{t("m_e617151df8")}</p>}
      </ResourceState>
    </SitePage>
  );
}
