import { ArticleLoading } from './components/ArticleLoading';
import { useI18n } from './i18n';
import { feedbackStore } from './lib/feedback';
import { confirmationStore } from './lib/confirmAction';
import { afterInitialLoad } from './lib/afterInitialLoad';
import {DocumentDataProvider, DocumentReady, useDocumentStatus, type DocumentData} from './context/DocumentData';
import { loadPage } from './lib/preloadPage';
import { RoutePreload } from './components/RoutePreload';
import { NavigationProtection } from './components/NavigationProtection';
import { DiagnosticNavigation } from './components/DiagnosticNavigation';
import { useCallback, lazy, Suspense, useState, useEffect, useSyncExternalStore } from 'react';
import { RoutePosition } from './components/RoutePosition';
import '../styles/experience.css';
const FeedbackHost = lazy(() => import('./components/FeedbackHost').then(m => ({ default: m.FeedbackHost })));
import { SiteSettingsProvider } from './context/SiteSettingsContext';
import HomePage from './pages/HomePage';
import { createBrowserRouter, createMemoryRouter, RouterProvider, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {Link} from './components/LocaleLink';
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
import { AuthProvider } from './context/AuthContext';
import { SiteMeta } from './components/SiteMeta';
import { SitePage, ContentSkeleton } from './components/ContentUI';
import { ThemeProvider } from './context/ThemeContext';
import {LocaleProvider} from './context/LocaleContext';
import {splitLocalePath} from './lib/locale';

const LocaleEffects = lazy(() => import('./components/LocaleEffects'));
const ReadingTools = lazy(() => import('./components/ReadingTools'));
const WeatherCompanion = lazy(() => import('./components/WeatherCompanion'));
const RoutePages=lazy(()=>import('./RoutePages'));
function DeferredFeedbackHost() {
  const [ready,setReady]=useState(false);
  const feedback=useSyncExternalStore(feedbackStore.subscribe,()=>feedbackStore.getSnapshot().length>0,()=>false);
  const confirmation=useSyncExternalStore(confirmationStore.subscribe,()=>Boolean(confirmationStore.getSnapshot()),()=>false);
  useEffect(()=>afterInitialLoad(()=>setReady(true)),[]);
  return ready||feedback||confirmation ? <Suspense fallback={null}><FeedbackHost/></Suspense> : null;
}
function PublicWeatherCompanion() {
  const [ready, setReady] = useState(false);
  useEffect(() => afterInitialLoad(() => setReady(true)), []);
  const { pathname } = useLocation();
  if (!ready || (pathname.startsWith('/admin') && pathname !== '/admin-login') || pathname.startsWith('/account')) return null;
  return <Suspense fallback={null}><WeatherCompanion /></Suspense>;
}

function RouteLoader() {
  const { t } = useI18n();
  const {pathname} = useLocation();
  if (/^\/article\//.test(splitLocalePath(pathname).pathname)) return <SitePage detail className="article-route"><ArticleLoading /></SitePage>;
  return <SitePage>{/^\/(login|register)$/.test(pathname) ? <section className="auth-route-skeleton" aria-label={t("m_bab32f18a4")}><ContentSkeleton/></section> : <ContentSkeleton />}</SitePage>;
}

function SiteRoutes() {
  const status=useDocumentStatus(), location=useLocation();
  const [initialKey]=useState(location.key);
  const [interactive, setInteractive] = useState(false);
  const onReady = useCallback(() => setInteractive(true), []);
  return <RoutePosition><NavigationProtection/><RoutePreload/>
          <SiteMeta /><DeferredFeedbackHost/>
          <DiagnosticNavigation />
          <Suspense fallback={<RouteLoader />}>{status && status>=400 && location.key===initialKey ? (status===404 ? <NotFoundPage/> : <RouteFailure/>) : (splitLocalePath(location.pathname).pathname==='/'?<HomePage/>:<RoutePages/>)}<DocumentReady onReady={onReady}/></Suspense>
          {interactive && <><Suspense fallback={null}><LocaleEffects/></Suspense><PublicWeatherCompanion /><Suspense fallback={null}><ReadingTools /></Suspense></>}
  </RoutePosition>;
}
function RouteFailure() {
  const { t } = useI18n();
  return <SitePage><section className="resource-notice" role="alert"><div><h1>{t("m_bfd3eb0bb1")}</h1><p>{t("m_8064323249")}</p></div><button className="quiet-button" onClick={()=>window.location.reload()}>{t("m_7bdd5ce1e2")}</button></section></SitePage>;
}
export default function App({url, documentData}: {url?:string; documentData?:DocumentData} = {}) {
  const [router] = useState(() => { const routes=[{path:'*',element:<LocaleProvider><AuthProvider><SiteSettingsProvider><SiteRoutes/></SiteSettingsProvider></AuthProvider></LocaleProvider>,errorElement:<LocaleProvider><AuthProvider><SiteSettingsProvider><RouteFailure/></SiteSettingsProvider></AuthProvider></LocaleProvider>}]; return url ? createMemoryRouter(routes,{initialEntries:[url]}) : createBrowserRouter(routes); });
  return <DocumentDataProvider data={documentData}><ThemeProvider><RouterProvider router={router}/></ThemeProvider></DocumentDataProvider>;
}
