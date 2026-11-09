import { reducedMotion } from '../lib/motionPreference';
import { useI18n } from '../i18n';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {Link} from '../components/LocaleLink';
import { PageHeading, SitePage, useResource, type PageData } from '../components/ContentUI';
import { SiteBack } from '../components/SiteBack';
import { useSiteSettings } from '../context/SiteSettingsContext';
import { useLocale } from '../context/LocaleContext';
import { localeResource } from '../lib/locale';
import { readSnapshot, writeSnapshot, snapshotGeneration, subscribeSnapshotInvalidation } from '../lib/publicSnapshots';
import { publicRead } from '../lib/publicRead';
import { safeImageSrc, safeRoutePath } from '../lib/safeUrl';
import { coverFrame } from '../lib/coverCrop';
import { responsiveImage } from '../lib/responsiveImage';
import { groupUpdates, updateText, type UpdateActivity } from './updates-v2-data';
import '../../styles/update-journal.css';
import '../../styles/updates-v2.css';
import '../../styles/article-label.css';

const filters = [['', '全部'], ['post', '文章'], ['update', '近况'], ['release', '项目版本']] as const;
const activityPath = (page: number, type: string) => `/activity?page=${page}&type=${encodeURIComponent(type)}`;

export default function UpdatesPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const type = filters.some(([key]) => key === params.get('type')) ? params.get('type') || '' : '';
  const requestedPage = Number(params.get('page'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const { data: settings } = useSiteSettings();
  const title = t("m_4b0bc25bf3", {v0: settings?.brand?.site_title?.trim() || 'mooncci'});
  const list = useRef<HTMLDivElement>(null);
  const filtersRoot = useRef<HTMLDivElement>(null), filterMarker = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const container = filtersRoot.current, marker = filterMarker.current;
    if (!container || !marker) return;
    const preference = window.matchMedia('(prefers-reduced-motion: no-preference)');
    const position = (animate: boolean) => {
      const selected = container.querySelector<HTMLButtonElement>('[aria-checked="true"]');
      if (!selected) return;
      const before = marker.getBoundingClientRect(), bounds = container.getBoundingClientRect();
      marker.getAnimations().forEach(animation => animation.cancel());
      const x = selected.offsetLeft + 2, width = selected.offsetWidth - 4;
      marker.style.width = `${width}px`;
      marker.style.transform = `translateX(${x}px)`;
      container.dataset.markerReady = 'true';
      if (animate && preference.matches && !reducedMotion() && before.width) marker.animate([
        { transform: `translateX(${before.left - bounds.left}px) scaleX(${before.width / width})` },
        { transform: `translateX(${x}px) scaleX(1)` },
      ], { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' });
    };
    position(true);
    let measuredWidth = container.clientWidth;
    const observer = new ResizeObserver(() => { if (container.clientWidth !== measuredWidth) { measuredWidth = container.clientWidth; position(false); } });
    observer.observe(container);
    const stop = () => position(false);
    preference.addEventListener('change', stop);
    window.addEventListener('mooncci:motion-change', stop);
    return () => { observer.disconnect(); preference.removeEventListener('change', stop); window.removeEventListener('mooncci:motion-change', stop); };
  }, [type]);
  const restoreY = useRef<{ y: number } | null>(null);
  const [minHeight, setMinHeight] = useState(0);
  useEffect(() => {
    // HTML normalizes title whitespace; compare the same normalized value to avoid observer loops.
    const normalizedTitle = title.replace(/[ \t\r\n\f]+/g, ' ').trim();
    const apply = () => { if (document.title !== normalizedTitle) document.title = normalizedTitle; };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
  useEffect(() => {
    if (restoreY.current === null) return;
    // The shared route manager resets search navigations; restore only this page's own controls.
    const intent = restoreY.current;
    const frame = requestAnimationFrame(() => { if (restoreY.current === intent) { window.scrollTo({ top: intent.y, behavior: 'instant' }); restoreY.current = null; } });
    const cancel = () => { cancelAnimationFrame(frame); if (restoreY.current === intent) restoreY.current = null; };
    window.addEventListener('wheel', cancel, { passive: true });
    window.addEventListener('touchstart', cancel, { passive: true });
    window.addEventListener('keydown', cancel);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('wheel', cancel); window.removeEventListener('touchstart', cancel); window.removeEventListener('keydown', cancel); };
  }, [location.key]);
  function change(nextType: string, nextPage: number) {
    restoreY.current = { y: window.scrollY };
    if (nextType !== type) setMinHeight(Math.max(0, window.innerHeight - (list.current?.getBoundingClientRect().top || 0)));
    const next = new URLSearchParams(params);
    next.set('type', nextType); next.set('page', String(nextPage));
    navigate({ pathname: location.pathname, search: next.toString(), hash: location.hash }, { replace: true });
  }
  return <SitePage className="updates-v2">
    <div className="updates-header-column">
    <SiteBack className="updates-back" />
    <PageHeading className="updates-heading" title={t("m_b067526e73")} back={false}><p>{t("m_6624096318")}</p></PageHeading>
    <div className="updates-filter-scroll"><div ref={filtersRoot} className="updates-filters" role="radiogroup" aria-label={t("m_673fa10a52")}>
      <span ref={filterMarker} className="updates-filter-marker" aria-hidden="true" />
      {filters.map(([key, label], index) => <button key={key} type="button" role="radio" aria-checked={type === key} tabIndex={type === key ? 0 : -1}
        onClick={() => { if (type !== key) change(key, 1); }}
        onKeyDown={event => {
          const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
          if (!delta && event.key !== 'Home' && event.key !== 'End') return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? filters.length - 1 : (index + delta + filters.length) % filters.length;
          (event.currentTarget.parentElement?.querySelectorAll('button')[next] as HTMLButtonElement)?.focus();
          change(filters[next][0], 1);
        }}><span>{t(label)}</span></button>)}
    </div></div>
    </div>
    <div ref={list} className="updates-list-space" style={{ minHeight: minHeight || undefined }}>
      <UpdatesFeed type={type} page={page} onMore={() => change(type, page + 1)} onFirst={() => change(type, 1)} />
    </div>
  </SitePage>;
}

function UpdatesFeed({ type, page, onMore, onFirst }: { type: string; page: number; onMore: () => void; onFirst: () => void }) {
  const { t } = useI18n();
  const resource = useResource<PageData<UpdateActivity>>(activityPath(page, type));
  const { contentLocale } = useLocale();
  const scope = `${contentLocale}:${type}`;
  const [cache, setCache] = useState<Record<string, Record<number, PageData<UpdateActivity>>>>({});
  const pages = cache[scope] || {};
  const requestVersion = useRef(0);
  const [previousResult, setPreviousResult] = useState<{scope: string; type: string; items: UpdateActivity[]; total: number} | null>(null);
  useEffect(() => subscribeSnapshotInvalidation(() => {
    requestVersion.current++;
    setCache({});
    setPreviousResult(null);
  }), []);
  const [backfillError, setBackfillError] = useState('');
  const [retry, setRetry] = useState(0);
  const focusNew = useRef<Set<string> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState('');
  useEffect(() => { if (resource.data) setCache(previous => ({ ...previous, [scope]: { ...previous[scope], [page]: resource.data! } })); }, [scope, page, resource.data]);
  const maxPage = resource.data ? Math.max(1, Math.ceil(resource.data.total / resource.data.pageSize)) : null;
  const outOfRange = maxPage !== null && page > maxPage;
  useEffect(() => {
    if (!resource.data || outOfRange) return;
    const controller = new AbortController();
    const version = ++requestVersion.current, generation = snapshotGeneration();
    setBackfillError('');
    // Validate against the server's total before restoring bookmarked pages, one request at a time.
    async function restorePages() {
      for (let number = 1; number < page; number++) {
        if (pages[number]) continue;
        const path = localeResource(activityPath(number, type), contentLocale);
        const data = readSnapshot(path) || await publicRead(path, controller.signal) as PageData<UpdateActivity>;
        if (controller.signal.aborted || version !== requestVersion.current || generation !== snapshotGeneration()) return;
        writeSnapshot(path, data, generation);
        setCache(previous => ({ ...previous, [scope]: { ...previous[scope], [number]: data } }));
      }
    }
    restorePages().catch(error => { if (!controller.signal.aborted) setBackfillError(error.message || t("m_d1d044826a")); });
    return () => { requestVersion.current++; controller.abort(); };
  }, [page, scope, retry, resource.data, outOfRange]);
  useEffect(() => { setBackfillError(''); focusNew.current = null; }, [scope]);
  const available = useMemo(() => {
    const restored: Record<number, PageData<UpdateActivity>> = {};
    // Recreate a previously loaded history entry before its first paint. Waiting
    // for effect-driven backfills makes scroll restoration chase changing height.
    if (resource.data && !outOfRange) for (let number = 1; number < page; number++) {
      const cached = readSnapshot(localeResource(activityPath(number, type), contentLocale));
      if (cached) restored[number] = cached;
    }
    return { ...restored, ...pages, ...(resource.data ? { [page]: resource.data } : {}) };
  }, [cache, scope, resource.data, page, outOfRange]);
  const currentItems = useMemo(() => {
    const seen = new Set<string>();
    return Object.entries(available).filter(([number]) => Number(number) <= page).sort(([a], [b]) => Number(a) - Number(b))
      .flatMap(([, data]) => data.items).filter(item => { if (seen.has(item.activity_id)) return false; seen.add(item.activity_id); return true; });
  }, [available, page]);
  const complete = !outOfRange && Object.keys(available).filter(number => Number(number) <= page).length === page;
  const currentTotal = resource.data?.total ?? pages[page - 1]?.total ?? currentItems.length;
  const switching = !!previousResult && previousResult.scope !== scope && (!complete || !!resource.error);
  const items = switching ? previousResult.items : currentItems;
  const total = switching ? previousResult.total : currentTotal;
  const shownType = switching ? previousResult.type : type;
  const groups = useMemo(() => groupUpdates(items), [items]);
  useEffect(() => {
    if (complete && !resource.error) setPreviousResult({scope, type, items: currentItems, total: currentTotal});
  }, [complete, resource.error, scope, currentItems, currentTotal]);
  const error = outOfRange ? t("m_2c5882fc7b") : resource.error || backfillError;
  useEffect(() => {
    if (!complete || switching || !focusNew.current) return;
    const id = items.find(item => !focusNew.current!.has(item.activity_id))?.activity_id;
    focusNew.current = null;
    if (id) [...root.current!.querySelectorAll<HTMLAnchorElement>('.updates-row')].find(row => row.dataset.activity === id)?.focus({ preventScroll: true });
  }, [complete, items]);
  useEffect(() => {
    if (!groups.length) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top); else visible.delete(entry.target.id); });
      const first = [...visible].sort((a, b) => a[1] - b[1])[0];
      if (first) setActive(first[0]);
    }, { rootMargin: '-20% 0px -70% 0px' });
    root.current?.querySelectorAll('.updates-month').forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [groups]);
  useEffect(() => { if (complete) window.dispatchEvent(new Event('mooncci:content-ready')); }, [complete]);
  return <div ref={root} className="updates-feed" aria-busy={!complete && !error}>
    <div className="updates-feed-content">
    {switching && <p className="updates-transition" role="status">{t(resource.error || backfillError ? '{requested}更新加载失败，当前仍显示{shown}更新' : '正在更新{requested}，当前仍显示{shown}更新', {requested: t(filters.find(([key]) => key === type)![1]), shown: t(filters.find(([key]) => key === shownType)![1])})}</p>}
    {!items.length && !error && !complete && <div className="updates-skeleton" role="status" aria-label={t("m_3f0ee082d2")}>{Array.from({ length: 8 }, (_, i) => <div key={i}><span /><span /><span /></div>)}</div>}
    {groups.map(group => <section key={group.key} className="updates-month" id={`g-${group.key}`} aria-labelledby={`heading-${group.key}`}>
      <h2 id={`heading-${group.key}`} className="updates-month-heading"><span>{group.label}</span><small>{group.items.length} {t("m_f004f1d84c")}</small></h2>
      {group.items.map(item => <UpdateRow key={item.activity_id} item={item} />)}
    </section>)}

    {error && <div className="updates-notice" role="alert"><p>{outOfRange ? t("m_60cb552f6a") : t("m_fcbfcd21a1")}</p><button type="button" onClick={() => { if (outOfRange) onFirst(); else { resource.reload(); setRetry(value => value + 1); } }}>{outOfRange ? t("m_1d964bbcfd") : t("m_b8784c8dd5")}</button></div>}
    {complete && !items.length && !error && <p className="updates-notice">{t("m_f9430a43f1")}</p>}
    {!!items.length && <div className="updates-pagination">
      {items.length < total ? <button type="button" disabled={!complete || switching} onClick={() => { focusNew.current = new Set(items.map(item => item.activity_id)); onMore(); }}>{complete && !switching ? t("m_af90a08fec") : t("m_21bd738e0d")}</button> : complete && <p>{t("m_b7c1cdefd7")}</p>}
      <small role="status">{t("m_326fee0b90")} {items.length} / {total} {t("m_f004f1d84c")}</small>
    </div>}
    </div>
    {!!groups.length && <aside className="updates-time-rail" aria-label={t("m_33c7164b10")}><nav><p>{t("m_8b6ff49851")}</p>{groups.map(group => <a key={group.key} href={`#g-${group.key}`} aria-current={(active || `g-${groups[0].key}`) === `g-${group.key}` ? 'location' : undefined}
      onClick={event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        document.getElementById(`g-${group.key}`)?.scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'start' });
        setActive(`g-${group.key}`);
      }}>{group.label}</a>)}</nav></aside>}
  </div>;
}

function UpdateRow({ item }: { item: UpdateActivity }) {
  const { t } = useI18n();
  const article = useResource<{ cover_image?: string; cover_crop?: unknown }>(`/posts/${item.id}`, item.type === 'post' && !item.cover_image);
  const post = item.cover_image ? item : article.data;
  const src = safeImageSrc(post?.cover_image);
  const frame = coverFrame(post?.cover_crop, 'card') || coverFrame(post?.cover_crop, 'detail');
  const position = frame ? `${frame.x * 100}% ${frame.y * 100}%` : '50% 30%';
  const text = updateText(item), titleId = `updates-title-${item.activity_id}`;
  const date = new Date(item.published_at);
  return <Link to={safeRoutePath(item.path)} className="updates-row" data-activity={item.activity_id} aria-labelledby={titleId}>
    <div className="updates-copy"><div className="updates-meta">
      <span className="updates-badge" data-type={item.type}>{filters.find(([key]) => key === item.type)?.[1] || t("m_3055a035f0")}</span>
      <time dateTime={Number.isNaN(date.getTime()) ? undefined : item.published_at}>{Number.isNaN(date.getTime()) ? t("m_0a680746ce") : t("m_d3e3f512cb", {v0: date.getMonth() + 1, v1: date.getDate()})}</time>
      {item.type === 'release' && <><span>GitHub Releases</span>{!!item.prerelease && <span className="updates-prerelease">{t("m_1acda6ce54")}</span>}</>}
      {item.type === 'update' && <span>{t("m_7e031417a8")}{typeof item.comment_count === 'number' && item.comment_count > 0 ? ` ${item.comment_count}` : ''}</span>}
    </div>
    {item.type === 'update' ? <p className="updates-note" id={titleId}>{text.excerpt || t("m_c93d1ee63c")}</p> : <><h3 id={titleId}>{text.title}</h3>{text.excerpt && <p className="updates-excerpt">{text.excerpt}</p>}</>}
    </div>
    {item.type === 'post' && src && <div className="updates-cover"><img {...responsiveImage(src, false, frame?.zoom ?? 1)} alt="" width={160} height={100} loading="lazy" decoding="async" style={{ objectPosition: position, transform: frame && frame.zoom !== 1 ? `scale(${frame.zoom})` : undefined, transformOrigin: position }} /></div>}
  </Link>;
}
export { default as UpdateDetailPage } from './NoteDetailPage';
