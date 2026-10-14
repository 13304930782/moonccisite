import { Link } from 'react-router-dom';
import { safeImageSrc } from '../lib/safeUrl';
import { labels } from './ContentUI';
import { compactProjectSummary, projectIcon } from '../lib/projectBrand';
import '../../styles/project-card.css';
export function ProjectCard({ project: p, featured = false }: { project: any; featured?: boolean }) {
  const image = safeImageSrc(p.cover_image);
  const icon = projectIcon(p);
  if (featured) return (
    <Link className="project-card project-card--featured project-card--compact" to={`/projects/${p.slug}`}>
      <div className="project-card-identity">
        <span className="eyebrow project-card-stage">{labels[p.stage] || p.stage}</span>
        <div className="project-card-title">
          {icon && <img className="project-card-icon" src={icon} alt={`${p.name} 应用图标`} width={48} height={48} />}
          <h3 className={String(p.name).length <= 18 ? 'project-card-name--single' : undefined}>{p.name}</h3>
        </div>
      </div>
      <div className="project-card-copy">
        <p>{compactProjectSummary(p.summary)}</p>
        {p.tech_stack && <small className="muted">{p.tech_stack}</small>}
        <span className="project-card-action">查看作品详情 <span aria-hidden="true">↗</span></span>
      </div>
    </Link>
  );
  return (
    <Link className={`project-card${featured ? ' project-card--featured' : ''}${image ? '' : ' project-card--no-image'}`} to={`/projects/${p.slug}`}>
      {image && <img src={image} alt={`${p.name} 界面截图`} loading="lazy" />}
      <div className="project-card-copy">
        <span className="eyebrow">{labels[p.stage]}</span>
        <div className="project-card-title">
          {icon && <img className="project-card-icon" src={icon} alt={`${p.name} 应用图标`} width={48} height={48} />}
          <h3>{p.name}</h3>
        </div>
        <p>{p.summary}</p>
        {p.tech_stack && <small className="muted">{p.tech_stack}</small>}
        {featured && <span className="project-card-action">查看作品详情 <span aria-hidden="true">↗</span></span>}
      </div>
    </Link>
  );
}
