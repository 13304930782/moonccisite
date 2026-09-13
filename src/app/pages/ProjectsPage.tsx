import { DetailPage, DetailMeta, EmptyState, SingleLine } from '../components/DetailUI';
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
      {
        const release = document.getElementById(`release-${focusedId}`);
        if (release) window.scrollTo({ top: window.scrollY + release.getBoundingClientRect().top - 100 });
      }
  }, [p, focusedId]);
  return (
    <SitePage>
      <ResourceState resource={resource}>
        {p && (
          <DetailPage className="project-reading" backTo="/projects" backLabel="全部作品" label={labels[p.stage] || '作品'} title={p.name}
            meta={<DetailMeta author={p.author_name} avatar={p.author_avatar} date={p.published_at || p.created_at} />}
            asideTitle="作品信息" aside={<>
              <SingleLine className="project-actions" label="作品链接">
                {p.demo_url && <a className="quiet-button project-primary" href={safeHref(p.demo_url)} target="_blank" rel="noreferrer">打开作品 ↗</a>}
                {p.repo && <a className="quiet-button" href={`https://github.com/${p.repo}`} target="_blank" rel="noreferrer">GitHub ↗</a>}
              </SingleLine>
              {p.tech_stack && <div className="project-tech"><h2>技术栈</h2><p>{p.tech_stack}</p></div>}
              <nav className="project-reading-toc" aria-label="作品目录"><h2>本页目录</h2>{headingsFor(p.content).map(h => <a key={h.id} href={`#project-${h.id}`}>{h.title}</a>)}<a href="#project-releases">版本记录</a></nav>
            </>}>
            {p.summary && <p className="article-summary">{p.summary}</p>}
            <div className="project-reading-body">
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
                <EmptyState>暂无正式版本记录。</EmptyState>
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
            </section></div>
          </DetailPage>
        )}
      </ResourceState>
    </SitePage>
  );
}
