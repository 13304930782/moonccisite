import { Link } from 'react-router-dom';
import { safeImageSrc } from '../lib/safeUrl';
import { labels } from './ContentUI';
export function ProjectCard({ project: p, featured = false }: { project: any; featured?: boolean }) {
  const image = safeImageSrc(p.cover_image);
  return (
    <Link className={`project-card${featured ? ' project-card--featured' : ''}${image ? '' : ' project-card--no-image'}`} to={`/projects/${p.slug}`}>
      {image && <img src={image} alt={`${p.name} 界面截图`} loading="lazy" />}
      <div className="project-card-copy">
        <span className="eyebrow">{labels[p.stage]}</span>
        <h3>{p.name}</h3>
        <p>{p.summary}</p>
        {p.tech_stack && <small className="muted">{p.tech_stack}</small>}
        {featured && <span className="project-card-action">查看作品详情 <span aria-hidden="true">↗</span></span>}
      </div>
    </Link>
  );
}
