import { useI18n } from '../i18n';
import { safeHref, safeRoutePath, isExternalHttpUrl } from '../lib/safeUrl';

import {Link} from '../components/LocaleLink';
import { Header } from '../components/Header';
import { FestivalSlot } from '../components/Festivals/Entry';
import { SiteFooter } from '../components/SiteFooter';
import { lazy, Suspense } from 'react';
const MarkdownContent = lazy(() => import('../components/MarkdownContent').then(m => ({ default: m.MarkdownContent })));
const HomeActivityList = lazy(() => import('../components/home/HomeActivityList').then(m => ({ default: m.HomeActivityList })));
const HomePostList = lazy(() => import('../components/home/HomeActivityList').then(m => ({ default: m.HomePostList })));
import {
  ContentSkeleton,
  StatusNotice,
  formatDate,
  ResourceState,
  SubscribeForm,
  useResource,
} from '../components/ContentUI';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { ProjectCard } from '../components/ProjectCard';
import { initialSiteSettings } from '../config/initialSiteSettings';
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
  const { t , formatDate} = useI18n();
  const note = latest.data?.items?.[0];
  return <ResourceState resource={latest}>
    {note ? <>
      <p className="home-note-text">{note.excerpt}</p>
      <time className="muted home-note-date" dateTime={note.published_at}>{t("m_e87b95c9d9")} {formatDate(note.published_at)}</time>
      <div className="hero-note-actions"><Link className="home-note-link" to={safeRoutePath(note.path)}>{t("m_7573ae2998")}</Link></div>
    </> : <StatusNotice>{t("m_9cb8e1eb1b")}</StatusNotice>}
  </ResourceState>;
}
export default function HomePage() {
  const { t , formatDate, locale} = useI18n();
  const settings = useSiteSettings(),
    now = useResource('/now'),
    activity = useResource('/activity?pageSize=6'),
    latest = useResource('/activity?type=update&pageSize=1'),
    posts = useResource('/posts?pageSize=4'),
    projects = useResource('/projects?featured=true');
  const hero = settings.data?.hero || {};
  const heroText = (value: string | undefined, fallback: string) => locale === 'en' && settings.data?.content_locale !== 'en' && value === fallback ? t(fallback) : value;
  const fallbackNoteId = now.data && !now.data.content?.trim() ? latest.data?.items?.[0]?.activity_id : null;
  const visibleActivity = (activity.data?.items || []).filter((item: any) => item.activity_id !== fallbackNoteId);
  return (
    <div className="neo-page home-v2">
      <FestivalSlot name="global" />
      <Header />
      <main className="site-container home-main">
        <section className="home-hero">
          <div className="hero-copy">
            <FestivalSlot name="home" />
            <ResourceState resource={settings}>
              <p className="eyebrow">
                {heroText(hero.eyebrow, initialSiteSettings.hero.eyebrow) ?? t("m_5cd0f9f9f6")}
              </p>
              <h1>
                {hero.title ||
                  `${hero.title_before || ''}${hero.title_highlight || ''}${hero.title_after || ''}` || 'Explore the Programming'}
              </h1>
              <p className="hero-description">{heroText(hero.subtitle, initialSiteSettings.hero.subtitle)}</p>
              <div className="home-hero-actions">
                {hero.primary_text && (
                  <HeroLink
                    to={hero.primary_link || '/articles'}
                    label={heroText(hero.primary_text, initialSiteSettings.hero.primary_text) || hero.primary_text}
                    primary
                  />
                )}{' '}
                {hero.secondary_text && (
                  <HeroLink
                    to={hero.secondary_link || '/categories'}
                    label={heroText(hero.secondary_text, initialSiteSettings.hero.secondary_text) || hero.secondary_text}
                  />
                )}
              </div>
            </ResourceState>
          </div>
          <aside className="now-panel">
            <p className="eyebrow">{t("m_9f3961cb01")}</p>
            <ResourceState resource={now}>
              {now.data?.content?.trim() ? (
                <>
                  <Suspense fallback={<div className="content-skeleton" style={{ minHeight: 96 }} aria-label={t("m_cec505cc58")} />}><MarkdownContent content={now.data.content} /></Suspense>
                  <time className="muted home-note-date" dateTime={now.data.updated_at || undefined}>
                     {t("m_7153f0918a")} {formatDate(now.data.updated_at)}
                  </time>
                  <div className="hero-note-actions"><Link className="home-note-link" to="/updates?type=update">{t("m_60abbed0ac")}</Link></div>
                </>
              ) : (
                <LatestNote latest={latest} />
              )}
            </ResourceState>
          </aside>
        </section>
        <section className="home-section home-updates" aria-labelledby="home-updates-title">
          <div className="section-heading">
            <h2 id="home-updates-title">{t("m_6bac827144")}</h2>
            <Link to="/updates" className="home-updates-link">
               {t("m_a06565298e")} </Link>
          </div>
          <ResourceState resource={activity}>
            <Suspense fallback={<ContentSkeleton />}>
              <HomeActivityList items={visibleActivity} posts={posts.data || []} postsLoading={posts.loading && posts.data === null} />
            </Suspense>
            <div className="home-updates-more"><Link to="/updates" className="home-soft-button">{t("m_028f1b91ab")}</Link></div>
          </ResourceState>
        </section>
        <section className="home-section home-posts" id="latest">
          <div className="section-heading">
            <h2>{t("m_2367beabf5")}</h2>
            <Link to="/articles" className="home-updates-link">
               {t("m_a8eaf5064f")} </Link>
          </div>
          <ResourceState resource={posts}>
            <Suspense fallback={<ContentSkeleton />}>
              <HomePostList posts={posts.data || []} />
            </Suspense>
            {posts.data?.length === 0 && (
              <p className="quiet-state">{t("m_8d66d9a80e")}</p>
            )}
          </ResourceState>
        </section>
        <section className="home-section">
          <div className="section-heading">
            <h2>{t("m_60054f92fe")}</h2>
            <Link to="/projects" className="home-updates-link">
               {t("m_5f3a631ada")} </Link>
          </div>
          <ResourceState resource={projects}>
            {projects.data?.items.length ? (
              <div className={`project-grid${projects.data.items.length === 1 ? ' project-grid--single' : ''}`}>
                {projects.data.items.map((p: any) => (
                  <ProjectCard key={p.id} project={p} featured={projects.data.items.length === 1} />
                ))}
              </div>
            ) : (
              <div className="project-grid project-grid--single">
                <Link className="project-card" to="/electricity">
                  <h3>{t("m_66afe807fc")}</h3>
                  <p>{t("m_5d1e648e42")}</p>
                </Link>
              </div>
            )}
          </ResourceState>
        </section>
      </main>
      <SubscribeForm />
      <FestivalSlot name="footer" />
      <SiteFooter home />
    </div>
  );
}
