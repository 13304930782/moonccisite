import { safeHref, safeRoutePath, isExternalHttpUrl } from '../lib/safeUrl';
import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { SiteFooter } from '../components/SiteFooter';
import { lazy, Suspense } from 'react';
const MarkdownContent = lazy(() => import('../components/MarkdownContent').then(m => ({ default: m.MarkdownContent })));
const HomeActivityList = lazy(() => import('../components/home/HomeActivityList').then(m => ({ default: m.HomeActivityList })));
const HomePostList = lazy(() => import('../components/home/HomeActivityList').then(m => ({ default: m.HomePostList })));
import {
  ContentSkeleton,
  formatDate,
  ResourceState,
  SubscribeForm,
  useResource,
} from '../components/ContentUI';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { ProjectCard } from '../components/ProjectCard';
import '../../styles/home-v2.css';

function HeroLink({ to, label, primary = false }: { to: string; label: string; primary?: boolean }) {
  const className = `neo-button home-hero-button${primary ? ' neo-button-dark home-hero-button--primary' : ''}`;
  return isExternalHttpUrl(to) ? (
    <a
      className={className}
      href={safeHref(to)}
      target="_blank"
      rel="noreferrer"
    >
      {label} ↗
    </a>
  ) : (
    <Link className={className} to={safeRoutePath(to)}>
      {label} ↗
    </Link>
  );
}
function LatestNote({ latest }: { latest: ReturnType<typeof useResource> }) {
  const note = latest.data?.items?.[0];
  return <ResourceState resource={latest}>
    {note ? <>
      <p className="home-note-text">{note.excerpt}</p>
      <time className="muted home-note-date" dateTime={note.published_at}>发布于 {formatDate(note.published_at)}</time>
      <div className="hero-note-actions"><Link className="home-note-link" to={safeRoutePath(note.path)}>查看这条近况 →</Link></div>
    </> : <p className="muted">还没有发布近况。</p>}
  </ResourceState>;
}
export default function HomePage() {
  const settings = useSiteSettings(),
    now = useResource('/now'),
    activity = useResource('/activity?pageSize=6'),
    latest = useResource('/activity?type=update&pageSize=1'),
    posts = useResource('/posts?pageSize=4'),
    projects = useResource('/projects?featured=true');
  const hero = settings.data?.hero || {};
  const fallbackNoteId = now.data && !now.data.content?.trim() ? latest.data?.items?.[0]?.activity_id : null;
  const visibleActivity = (activity.data?.items || []).filter((item: any) => item.activity_id !== fallbackNoteId);
  return (
    <div className="neo-page home-v2">
      <Header />
      <main className="site-container home-main">
        <section className="home-hero">
          <div className="hero-copy">
            <ResourceState resource={settings}>
              <p className="eyebrow">
                {hero.eyebrow ?? 'mooncci / 个人技术手记'}
              </p>
              <h1>
                {hero.title ||
                  `${hero.title_before || ''}${hero.title_highlight || ''}${hero.title_after || ''}` || 'Explore the Programming'}
              </h1>
              <p className="hero-description">{hero.subtitle}</p>
              <div className="home-hero-actions">
                {hero.primary_text && (
                  <HeroLink
                    to={hero.primary_link || '/articles'}
                    label={hero.primary_text}
                    primary
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
            <p className="eyebrow">最近近况</p>
            <ResourceState resource={now}>
              {now.data?.content?.trim() ? (
                <>
                  <Suspense fallback={<div className="content-skeleton" style={{ minHeight: 96 }} aria-label="正在加载近况正文" />}><MarkdownContent content={now.data.content} /></Suspense>
                  <time className="muted home-note-date" dateTime={now.data.updated_at || undefined}>
                    更新于 {formatDate(now.data.updated_at)}
                  </time>
                  <div className="hero-note-actions"><Link className="home-note-link" to="/updates?type=update">查看近况 →</Link></div>
                </>
              ) : (
                <LatestNote latest={latest} />
              )}
            </ResourceState>
          </aside>
        </section>
        <section className="home-section home-updates" aria-labelledby="home-updates-title">
          <div className="section-heading">
            <h2 id="home-updates-title">最近动态</h2>
            <Link to="/updates" className="home-updates-link">
              全部更新 →
            </Link>
          </div>
          <ResourceState resource={activity}>
            <Suspense fallback={<ContentSkeleton />}>
              <HomeActivityList items={visibleActivity} posts={posts.data || []} postsLoading={posts.loading && posts.data === null} />
            </Suspense>
            <div className="home-updates-more"><Link to="/updates" className="home-soft-button">查看全部更新</Link></div>
          </ResourceState>
        </section>
        <section className="home-section home-posts" id="latest">
          <div className="section-heading">
            <h2>最近写了什么</h2>
            <Link to="/articles" className="home-updates-link">
              文章库 →
            </Link>
          </div>
          <ResourceState resource={posts}>
            <Suspense fallback={<ContentSkeleton />}>
              <HomePostList posts={posts.data || []} />
            </Suspense>
            {posts.data?.length === 0 && (
              <p className="quiet-state">第一篇文章正在准备中。</p>
            )}
          </ResourceState>
        </section>
        <section className="home-section">
          <div className="section-heading">
            <h2>作品与实验</h2>
            <Link to="/projects" className="home-updates-link">
              全部作品 →
            </Link>
          </div>
          <ResourceState resource={projects}>
            {projects.data?.items.length ? (
              <div className={`project-grid${projects.data.items.length === 1 ? ' project-grid--single' : ''}`}>
                {projects.data.items.map((p: any) => (
                  <ProjectCard key={p.id} project={p} featured={projects.data.items.length === 1} />
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
      </main>
      <SubscribeForm />
      <SiteFooter />
    </div>
  );
}
