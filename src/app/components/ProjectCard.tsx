import { Link } from 'react-router-dom';
import { safeImageSrc, safeHref } from '../lib/safeUrl';
import { labels } from './ContentUI';
export function ProjectCard({ project: p }: { project: any }) {
  return (
    <Link className="project-card" to={`/projects/${p.slug}`}>
      {safeImageSrc(p.cover_image) && (
        <img src={safeImageSrc(p.cover_image)} alt="" loading="lazy" />
      )}
      <span className="eyebrow">{labels[p.stage]}</span>
      <h3>
        {p.name} <span aria-hidden="true">↗</span>
      </h3>
      <p>{p.summary}</p>
      <small className="muted">{p.tech_stack}</small>
    </Link>
  );
}
