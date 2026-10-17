import { EmptyState } from '../components/DetailUI';
import { SiteBack } from '../components/SiteBack';
import { useRestoredPagePosition } from '../components/RoutePosition';
import { ProjectCard } from '../components/ProjectCard';
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePageSearchParams as useSearchParams } from '../lib/usePageSearchParams';
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
import "../../styles/selection-fold.css";
export default function ProjectsPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const resource = useResource(`/projects?page=${page}`, true, { keepPrevious: true });
  return (
    <SitePage>
      <PageHeading eyebrow="SELECTED WORK" title="作品与实验">
        <p>从一个想法开始，持续构建与维护。</p>
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
                作品介绍整理中。
                <Link to="/early-access" className="text-link">
                  了解 PromptDock
                </Link>
              </p>
            )}
            <Pagination
              data={resource.loading || resource.error ? { ...resource.data, page } : resource.data}
              onPage={(p,options) => setParams(current=>{const next=new URLSearchParams(current);p===1?next.delete('page'):next.set('page',String(p));return next;},options)}
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
  const restoringPosition = useRestoredPagePosition();
  const focusTarget = `${slug}:${focusedId || ''}`;
  const releaseFocus = useRef({ target: focusTarget, pending: !restoringPosition });
  if (releaseFocus.current.target !== focusTarget) {
    releaseFocus.current = { target: focusTarget, pending: !restoringPosition };
  }
  const articleRef = useRef<HTMLElement>(null);
  const headings = useMemo(() => headingsFor(p?.content || ''), [p?.content]);
  const toc = useMemo(() => [
    ...headings.map(heading => ({ ...heading, id: `project-${heading.id}` })),
    { id: 'project-releases', title: '版本记录', level: 2 },
  ], [headings]);
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
    if (releaseFocus.current.pending && p && focusedId && /^\d+$/.test(focusedId))
      {
        const release = document.getElementById(`release-${focusedId}`);
        if (release) {
          releaseFocus.current.pending = false;
          window.scrollTo({ top: window.scrollY + release.getBoundingClientRect().top - 100 });
        }
      }
  }, [p, focusedId, focusTarget]);
  const cover = p ? safeImageSrc(p.cover_image) : '';
  const icon = p ? projectIcon(p) : undefined;
  const renderToc = (compact = false) => (
    <nav className="project-reading-toc" aria-label={compact ? '折叠作品目录' : '作品目录'}>
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
                <span className="project-detail-pill project-detail-stage">{labels[p.stage] || '作品'}</span>
              </div>
              <div className="project-detail-identity">
                {icon && <img className="project-detail-icon" src={icon} alt={`${p.name} 应用图标`} width="72" height="72" />}
                <h1 className="detail-title">{p.name}</h1>
              </div>
              {p.summary && <p className="project-detail-subtitle">{p.summary}</p>}
              <div className="project-actions" aria-label="作品链接" data-reading-ignore>
                {p.demo_url && <a className="project-detail-action project-primary" href={safeHref(p.demo_url)} target="_blank" rel="noreferrer">{p.slug === 'promptdock' ? '申请体验' : '打开作品'} ↗</a>}
                {p.slug === 'promptdock' && !p.demo_url && <Link className="project-detail-action project-primary" to="/early-access">申请体验 ↗</Link>}
                {p.repo && <a className="project-detail-action" href={safeHref(`https://github.com/${p.repo}`)} target="_blank" rel="noreferrer">GitHub ↗</a>}
              </div>
              {p.tech_stack && <p className="project-detail-tech" aria-label="技术栈">{p.tech_stack}</p>}
            </header>
            {cover && <figure className="project-detail-showcase">
              <img className="content-image" src={cover} alt={`${p.name} 界面截图`} {...dimensionsFor(cover, p.image_dimensions)} loading="eager" fetchPriority="high" />
            </figure>}
            <div className="project-reading-grid">
              <details className="project-mobile-toc motion-details" data-reading-ignore>
                <summary>本页目录 <span data-disclosure-chevron aria-hidden="true">⌄</span></summary>
                {renderToc(true)}
              </details>
              <div className="detail-body project-reading-body">
                <MarkdownContent content={p.content} headingPrefix="project-heading" />
                <section className="project-releases" id="project-releases" data-reading-ignore>
                  <h2>版本记录</h2>
                  {!p.releases.items.length && (
                    <EmptyState>暂无版本记录。</EmptyState>
                  )}
                  {(p.focusedRelease &&
                  !p.releases.items.some((r: any) => r.id === p.focusedRelease.id)
                    ? [p.focusedRelease, ...p.releases.items]
                    : p.releases.items
                  ).map((r: any) => (
                    <details
                      open={String(r.id)===focusedId}
                      className="release-record motion-details"
                      key={r.id}
                      id={`release-${r.id}`}
                    >
                      <summary><span className="project-release-copy"><time className="muted">
                        {formatDate(r.published_at)} · GitHub Releases
                      </time>
                      <span>{r.title} {Number(r.prerelease) === 1 && <small className="release-prerelease">预发布</small>}</span></span><span className="project-release-arrow" data-disclosure-chevron aria-hidden="true">⌄</span></summary>
                      <div className="project-release-body"><MarkdownContent content={r.content} />
                      <a
                        className="text-link"
                        href={safeHref(r.url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        查看原始发布 ↗
                      </a></div>
                    </details>
                  ))}
                  <Pagination
                    data={p.releases}
                    onPage={(page,options) => setParams(current => {
                      const next = new URLSearchParams(current);
                      page===1?next.delete('page'):next.set('page', String(page));
                      return next;
                    },options)}
                  />
                </section>
              </div>
                  <aside className="project-reading-rail" data-reading-ignore>
                <div className="project-rail-sticky"><p>本页目录</p>{renderToc()}</div>
              </aside>
            </div>
          </article>
        )}
      </ResourceState>
    </SitePage>
  );
}
