import { useI18n } from '../i18n';
import '../../styles/content-discovery.css';

import {Link} from '../components/LocaleLink';
import { SitePage, PageHeading, ResourceState, useResource } from '../components/ContentUI';
export default function CategoriesPage() {
  const { t } = useI18n();
  const resource = useResource('/posts/meta/categories');
  return (
    <SitePage className="discovery-page">
      <PageHeading eyebrow="INDEX" title={t("m_01c4d76e3d")}>
        <p>{t("m_1442263c42")}</p>
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
              <p>{item.count}  {t("m_9f115826f3")}</p>
            </Link>
          ))}
        </div>
        {resource.data?.length === 0 && <p className="quiet-state">{t("m_e617151df8")}</p>}
      </ResourceState>
    </SitePage>
  );
}
