import { safeHref, safeRoutePath, isExternalHttpUrl } from '../lib/safeUrl';
import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { SiteFooter } from '../components/SiteFooter';
import { BlogCard } from '../components/BlogCard';
import { lazy, Suspense } from 'react';
const MarkdownContent = lazy(() => import('../components/MarkdownContent').then(m => ({ default: m.MarkdownContent })));
import {
  ActivityList,
  formatDate,
  ResourceState,
  SubscribeForm,
  useResource,
} from '../components/ContentUI';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { ProjectCard } from '../components/ProjectCard';
function HeroLink({ to, label }: { to: string; label: string }) {
  return isExternalHttpUrl(to) ? (
    <a
      className="text-link"
      href={safeHref(to)}
      target="_blank"
      rel="noreferrer"
    >
      {label} ↗
    </a>
  ) : (
    <Link className="text-link" to={safeRoutePath(to)}>
      {label} ↗
    </Link>
  );
}
function LatestNote() {
  // Query independently: the newest six activities may all be articles.
  const latest = useResource('/activity?type=update&pageSize=1');
  const note = latest.data?.items?.[0];
  return <ResourceState resource={latest}>
    {note ? <>
      <p>{note.excerpt}</p>
      <time className="muted">发布于 {formatDate(note.published_at)}</time>
      <div><Link className="text-link" to={safeRoutePath(note.path)}>查看这条近况 ↗</Link></div>
    </> : <p className="muted">还没有发布近况。</p>}
  </ResourceState>;
}
export default function HomePage() {
  const settings = useSiteSettings(),
    now = useResource('/now'),
    activity = useResource('/activity?pageSize=6'),
    posts = useResource('/posts?pageSize=4'),
    projects = useResource('/projects?featured=true');
  const hero = settings.data?.hero || {};
  return (
    <div className="neo-page">
      <Header />
      <main className="site-container home-main">
        <section className="home-hero">
          <div>
            <ResourceState resource={settings}>
              <p className="eyebrow">
                {hero.eyebrow ?? 'mooncci / 个人技术手记'}
              </p>
              <h1>
                {hero.title ||
                  `${hero.title_before || ''}${hero.title_highlight || ''}${hero.title_after || ''}`}
              </h1>
              <p className="hero-description">{hero.subtitle}</p>
              <div className="inline-actions">
                {hero.primary_text && (
                  <HeroLink
                    to={hero.primary_link || '/articles'}
                    label={hero.primary_text}
                  />
                )}{' '}
                {hero.secondary_text && (
                  <HeroLink
                    to={hero.secondary_link || '/categories'}
                    label={hero.secondary_text}
                  />
                )}
              </div>
            </ResourceState>
          </div>
          <aside className="now-panel">
            <p className="eyebrow">{now.data && !now.data.content?.trim() ? 'LATEST NOTE / 最近近况' : 'NOW / 正在做什么'}</p>
            <ResourceState resource={now}>
              {now.data?.content?.trim() ? (
                <>
                  <Suspense fallback={<div className="content-skeleton" style={{ minHeight: 96 }} aria-label="正在加载近况正文" />}><MarkdownContent content={now.data.content} /></Suspense>
                  <time className="muted">
                    更新于 {formatDate(now.data.updated_at)}
                  </time>
                </>
              ) : (
                <LatestNote />
              )}
            </ResourceState>
          </aside>
        </section>
        <section className="home-section">
          <div className="section-heading">
            <h2>最近动态</h2>
            <Link to="/updates" className="text-link">
              全部更新 ↗
            </Link>
          </div>
          <ResourceState resource={activity}>
            <ActivityList items={activity.data?.items || []} />
          </ResourceState>
        </section>
        <section className="home-section" id="latest">
          <div className="section-heading">
            <h2>最近写了什么</h2>
            <Link to="/articles" className="text-link">
              文章库 ↗
            </Link>
          </div>
          <ResourceState resource={posts}>
            <div className="post-grid">
              {(posts.data || []).map((p: any, index: number) => (
                <BlogCard
                  key={p.id}
                  id={p.id}
                  title={p.title}
                  excerpt={p.summary}
                  date={p.published_at || p.created_at}
                  tags={Array.isArray(p.tags) ? p.tags : []}
                  readTime=""
                  image={p.cover_image}
                  index={index}
                />
              ))}
            </div>
            {posts.data?.length === 0 && (
              <p className="quiet-state">第一篇文章正在准备中。</p>
            )}
          </ResourceState>
        </section>
        <section className="home-section">
          <div className="section-heading">
            <h2>作品与实验</h2>
            <Link to="/projects" className="text-link">
              全部作品 ↗
            </Link>
          </div>
          <ResourceState resource={projects}>
            {projects.data?.items.length ? (
              <div className="project-grid">
                {projects.data.items.map((p: any) => (
                  <ProjectCard key={p.id} project={p} />
                ))}
              </div>
            ) : (
              <div className="project-grid">
                <Link className="project-card" to="/electricity">
                  <h3>宿舍电量监控 ↗</h3>
                  <p>查看电量快照与使用趋势。</p>
                </Link>
                <Link className="project-card" to="/early-access">
                  <h3>PromptDock ↗</h3>
                  <p>了解并申请 Early Access。</p>
                </Link>
              </div>
            )}
          </ResourceState>
        </section>
        <SubscribeForm />
      </main>
      <SiteFooter />
    </div>
  );
}
