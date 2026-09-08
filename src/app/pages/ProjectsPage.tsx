import { useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  PageHeading,
  Pagination,
  ResourceState,
  SitePage,
  formatDate,
  labels,
  useResource,
} from "../components/ContentUI";
import { MarkdownContent } from "../components/MarkdownContent";
import { safeImageSrc, safeHref } from "../lib/safeUrl";
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
export default function ProjectsPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const resource = useResource(`/projects?page=${page}`);
  return (
    <SitePage>
      <PageHeading eyebrow="SELECTED WORK" title="作品与实验">
        <p>从一个想法开始，持续构建与维护。</p>
      </PageHeading>
      <ResourceState resource={resource}>
        {resource.data && (
          <>
            <div className="project-grid">
              {resource.data.items.map((p: any) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
            {!resource.data.items.length && (
              <p className="quiet-state">
                作品介绍整理中。
                <Link to="/early-access" className="text-link">
                  了解 PromptDock
                </Link>
              </p>
            )}
            <Pagination
              data={resource.data}
              onPage={(p) => setParams({ page: String(p) })}
            />
          </>
        )}
      </ResourceState>
    </SitePage>
  );
}
export function ProjectDetailPage() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const resource = useResource(
      `/projects/${slug}?page=${Math.max(1, Number(params.get("page")) || 1)}&release=${encodeURIComponent(params.get("release") || "")}`,
    ),
    p = resource.data;
  const focusedId = params.get("release");
  useEffect(() => {
    if (p && focusedId && /^\d+$/.test(focusedId))
      document
        .getElementById(`release-${focusedId}`)
        ?.scrollIntoView({ block: "start" });
  }, [p, focusedId]);
  return (
    <SitePage narrow>
      <Link className="text-link" to="/projects">
        ← 全部作品
      </Link>
      <ResourceState resource={resource}>
        {p && (
          <>
            <PageHeading eyebrow={labels[p.stage]} title={p.name}>
              <p>{p.summary}</p>
            </PageHeading>
            <div className="inline-actions">
              {p.demo_url && (
                <a
                  className="quiet-button"
                  href={safeHref(p.demo_url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  打开作品 ↗
                </a>
              )}
              {p.repo && (
                <a
                  className="text-link"
                  href={`https://github.com/${p.repo}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub ↗
                </a>
              )}
            </div>
            <p className="muted">{p.tech_stack}</p>
            {safeImageSrc(p.cover_image) && (
              <img
                className="content-image"
                src={safeImageSrc(p.cover_image)}
                alt={p.name}
              />
            )}
            <MarkdownContent content={p.content} />
            <section className="home-section">
              <h2>版本记录</h2>
              {!p.releases.items.length && (
                <p className="quiet-state">暂无正式版本记录。</p>
              )}
              {(p.focusedRelease &&
              !p.releases.items.some((r: any) => r.id === p.focusedRelease.id)
                ? [p.focusedRelease, ...p.releases.items]
                : p.releases.items
              ).map((r: any) => (
                <article
                  className="release-record"
                  key={r.id}
                  id={`release-${r.id}`}
                >
                  <time className="muted">
                    {formatDate(r.published_at)} · GitHub Releases
                  </time>
                  <h3>{r.title}</h3>
                  <MarkdownContent content={r.content} />
                  <a
                    className="text-link"
                    href={safeHref(r.url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看原始发布 ↗
                  </a>
                </article>
              ))}
              <Pagination
                data={p.releases}
                onPage={(page) => setParams({ page: String(page) })}
              />
            </section>
          </>
        )}
      </ResourceState>
    </SitePage>
  );
}
