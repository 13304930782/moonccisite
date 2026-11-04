import { useI18n } from '../i18n';
import { EmptyState } from '../components/DetailUI';
import { SiteBack } from '../components/SiteBack';
import { ProjectCard } from '../components/ProjectCard';
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
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
import { projectIcon } from "../lib/projectBrand";
import { dimensionsFor } from "../lib/imageDimensions";
import "../../styles/project-detail.css";
export default function ProjectsPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const resource = useResource(`/projects?page=${page}`);
  return (
    <SitePage>
      <PageHeading eyebrow="SELECTED WORK" title={t("m_60054f92fe")}>
        <p>{t("m_7a1c361f82")}</p>
      </PageHeading>
      <ResourceState resource={resource}>
        {resource.data && (
          <>
            <div className={`project-grid${resource.data.total === 1 ? ' project-grid--single' : ''}`}>
              {resource.data.items.map((p: any) => (
                <ProjectCard key={p.id} project={p} featured={resource.data.total === 1} />
              ))}
            </div>
            {!resource.data.items.length && (
              <p className="quiet-state">
                 {t("m_d6544b8258")}
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
  const { t , formatDate, locale: messageLocale} = useI18n();
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const resource = useResource(
      `/projects/${slug}?page=${Math.max(1, Number(params.get("page")) || 1)}&release=${encodeURIComponent(params.get("release") || "")}`,
    ),
    p = resource.data;
  const focusedId = params.get("release");
  const articleRef = useRef<HTMLElement>(null);
  const headings = useMemo(() => headingsFor(p?.content || ''), [p?.content]);
  const toc = useMemo(() => [
    ...headings.map(heading => ({ ...heading, id: `project-${heading.id}` })),
    { id: 'project-releases', title: t("m_77426c9420"), level: 2 },
  ], [headings, t, messageLocale]);
  const [activeId, setActiveId] = useState('');
  useEffect(() => {
    if (!p) return;
    setActiveId(toc[0].id);
    if (typeof IntersectionObserver === 'undefined') return;
    const visible = new Map<string, Element>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.set(entry.target.id, entry.target);
        else visible.delete(entry.target.id);
      }
      const first = [...visible.values()].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
      if (first) setActiveId(first.id);
    }, { rootMargin: '-96px 0px -55% 0px' });
    for (const item of toc) {
      const element = articleRef.current?.querySelector(`#${item.id}`);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [p, toc]);
  useEffect(() => {
    if (p && focusedId && /^\d+$/.test(focusedId))
      {
        const release = document.getElementById(`release-${focusedId}`);
        if (release) window.scrollTo({ top: window.scrollY + release.getBoundingClientRect().top - 100 });
      }
  }, [p, focusedId]);
  const cover = p ? safeImageSrc(p.cover_image) : '';
  const icon = p ? projectIcon(p) : undefined;
  const renderToc = (compact = false) => (
    <nav className="project-reading-toc" aria-label={compact ? t("m_463b1ea287") : t("m_8b499334da")}>
      {toc.map(item => <a key={item.id} href={`#${item.id}`} title={item.title}
        data-level={item.level} aria-current={activeId === item.id ? 'location' : undefined}
        onClick={event => {
          setActiveId(item.id);
          if (compact) event.currentTarget.closest('details')?.removeAttribute('open');
        }}>{item.title}</a>)}
    </nav>
  );
  return (
    <SitePage detail className="project-detail-page">
      <ResourceState resource={resource}>
        {p && (
          <article className="project-reading" ref={articleRef} data-reading-content>
            <header className="project-detail-heading">
              <div className="project-detail-back-row" data-reading-ignore>
                <SiteBack className="project-detail-pill" />
                <span className="project-detail-pill project-detail-stage">{t(labels[p.stage] || t("m_37a3a79686"))}</span>
              </div>
              <div className="project-detail-identity">
                {icon && <img className="project-detail-icon" src={icon} alt={t("m_fd6cae9364", {v0: p.name})} width="72" height="72" />}
                <h1 className="detail-title">{p.name}</h1>
              </div>
              {p.summary && <p className="project-detail-subtitle">{p.summary}</p>}
              <div className="project-actions" aria-label={t("m_82be8e3f6a")} data-reading-ignore>
                {p.demo_url && <a className="project-detail-action project-primary" href={safeHref(p.demo_url)} target="_blank" rel="noreferrer">{p.slug === 'promptdock' ? t("m_0a3d74a34d") : t("m_c40cb0b7ff")} ↗</a>}
                {p.repo && <a className="project-detail-action" href={safeHref(`https://github.com/${p.repo}`)} target="_blank" rel="noreferrer">GitHub ↗</a>}
              </div>
              {p.tech_stack && <p className="project-detail-tech" aria-label={t("m_265b45019e")}>{p.tech_stack}</p>}
            </header>
            {cover && <figure className="project-detail-showcase">
              <img className="content-image" src={cover} alt={t("m_ae1ed9ceba", {v0: p.name})} {...dimensionsFor(cover, p.image_dimensions)} loading="eager" fetchPriority="high" />
            </figure>}
            <div className="project-reading-grid">
              <details className="project-mobile-toc" data-reading-ignore>
                <summary>{t("m_a610e0c62b")} <span aria-hidden="true">⌄</span></summary>
                {renderToc(true)}
              </details>
              <div className="detail-body project-reading-body">
                <MarkdownContent content={p.content} headingPrefix="project-heading" />
                <section className="project-releases" id="project-releases" data-reading-ignore>
                  <h2>{t("m_77426c9420")}</h2>
                  {!p.releases.items.length && (
                    <EmptyState>{t("m_04d84a4e12")}</EmptyState>
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
                      <summary><span className="project-release-copy"><time className="muted">
                        {formatDate(r.published_at)} · GitHub Releases
                      </time>
                      <span>{r.title} {Number(r.prerelease) === 1 && <small className="release-prerelease">{t("m_1acda6ce54")}</small>}</span></span><span className="project-release-arrow" aria-hidden="true">⌄</span></summary>
                      <div className="project-release-body"><MarkdownContent content={r.content} />
                      <a
                        className="text-link"
                        href={safeHref(r.url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                         {t("m_61ea40b478")} </a></div>
                    </details>
                  ))}
                  <Pagination
                    data={p.releases}
                    onPage={(page) => setParams(current => {
                      const next = new URLSearchParams(current);
                      next.set('page', String(page));
                      return next;
                    })}
                  />
                </section>
              </div>
                  <aside className="project-reading-rail" data-reading-ignore>
                <div className="project-rail-sticky"><p>{t("m_a610e0c62b")}</p>{renderToc()}</div>
              </aside>
            </div>
          </article>
        )}
      </ResourceState>
    </SitePage>
  );
}
