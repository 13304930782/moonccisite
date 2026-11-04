import {localizedPath} from '../lib/locale';
import { useI18n } from '../i18n';

import {Link} from './LocaleLink';
import { safeImageSrc } from '../lib/safeUrl';
import { labels } from './ContentUI';
import { compactProjectSummary, projectIcon } from '../lib/projectBrand';
import '../../styles/project-card.css';
export function ProjectCard({ project: p, featured = false }: { project: any; featured?: boolean }) {
  const { t } = useI18n();
  const image = safeImageSrc(p.cover_image);
  const icon = projectIcon(p);
  if (featured) return (
    <Link className="project-card project-card--featured project-card--compact" to={localizedPath(`/projects/${p.slug}`,p.content_locale||'zh-CN')}>
      <div className="project-card-identity">
        <span className="eyebrow project-card-stage">{t(labels[p.stage] || p.stage)}</span>
        <div className="project-card-title">
          {icon && <img className="project-card-icon" src={icon} alt={t("m_fd6cae9364", {v0: p.name})} width={48} height={48} />}
          <h3 className={String(p.name).length <= 18 ? 'project-card-name--single' : undefined}>{p.name}</h3>
        </div>
      </div>
      <div className="project-card-copy">
        <p>{compactProjectSummary(p.summary)}</p>
        {p.tech_stack && <small className="muted">{p.tech_stack}</small>}
        <span className="project-card-action">{t("m_14a7c769cf")} <span aria-hidden="true">↗</span></span>
      </div>
    </Link>
  );
  return (
    <Link className={`project-card${featured ? ' project-card--featured' : ''}${image ? '' : ' project-card--no-image'}`} to={localizedPath(`/projects/${p.slug}`,p.content_locale||'zh-CN')}>
      {image && <img src={image} alt={t("m_ae1ed9ceba", {v0: p.name})} loading="lazy" />}
      <div className="project-card-copy">
        <span className="eyebrow">{t(labels[p.stage] || p.stage)}</span>
        <div className="project-card-title">
          {icon && <img className="project-card-icon" src={icon} alt={t("m_fd6cae9364", {v0: p.name})} width={48} height={48} />}
          <h3>{p.name}</h3>
        </div>
        <p>{p.summary}</p>
        {p.tech_stack && <small className="muted">{p.tech_stack}</small>}
        {featured && <span className="project-card-action">{t("m_14a7c769cf")} <span aria-hidden="true">↗</span></span>}
      </div>
    </Link>
  );
}
