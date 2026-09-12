import { ProjectCard } from '../components/ProjectCard';
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
import { MarkdownContent, headingsFor } from "../components/MarkdownContent";
import { safeImageSrc, safeHref } from "../lib/safeUrl";
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
    <SitePage>
      <Link className="text-link" to="/projects">
        ← 全部作品
      </Link>
      <ResourceState resource={resource}>
        {p && (
          <article className="project-reading" data-reading-content>
            <header className="project-intro">
            <PageHeading eyebrow={labels[p.stage]} title={p.name}>
              <p>{p.summary}</p>
            </PageHeading>
            </header><div className="project-reading-layout">
            <aside className="project-reading-aside" data-reading-ignore><h2>作品信息</h2><div className="inline-actions">
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
            {p.tech_stack && <div className="project-tech"><h3>技术栈</h3><p>{p.tech_stack}</p></div>}
            <details className="project-reading-toc" open={window.matchMedia('(min-width:761px)').matches}><summary>本页目录</summary><nav aria-label="作品目录">{headingsFor(p.content).map(h=><a key={h.id} href={`#project-${h.id}`}>{h.title}</a>)}<a href="#project-releases">版本记录</a></nav></details>
            </aside><div className="project-reading-body">
            {safeImageSrc(p.cover_image) && (
              <img
                className="content-image"
                src={safeImageSrc(p.cover_image)}
                alt={p.name}
              />
            )}
            <MarkdownContent content={p.content} headingPrefix="project-heading" />
            <section className="project-releases" id="project-releases" data-reading-ignore>
              <h2>版本记录</h2>
              {!p.releases.items.length && (
                <p className="quiet-state">暂无正式版本记录。</p>
              )}
              {(p.focusedRelease &&
              !p.releases.items.some((r: any) => r.id === p.focusedRelease.id)
                ? [p.focusedRelease, ...p.releases.items]
                : p.releases.items
              ).map((r: any) => (
                <details
                  open={String(r.id)===focusedId}
                  className="release-record"
                  key={r.id}
                  id={`release-${r.id}`}
                >
                  <summary><time className="muted">
                    {formatDate(r.published_at)} · GitHub Releases
                  </time>
                  <span>{r.title}</span></summary>
                  <MarkdownContent content={r.content} />
                  <a
                    className="text-link"
                    href={safeHref(r.url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看原始发布 ↗
                  </a>
                </details>
              ))}
              <Pagination
                data={p.releases}
                onPage={(page) => setParams({ page: String(page) })}
              />
            </section></div></div>
          </article>
        )}
      </ResourceState>
    </SitePage>
  );
}
