import { feedbackStore } from './lib/feedback';
import { confirmationStore } from './lib/confirmAction';
import { afterInitialLoad } from './lib/afterInitialLoad';
import {DocumentDataProvider, useDocumentStatus, type DocumentData} from './context/DocumentData';
import { loadPage } from './lib/preloadPage';
import { RoutePreload } from './components/RoutePreload';
import { NavigationProtection } from './components/NavigationProtection';
import { DiagnosticNavigation } from './components/DiagnosticNavigation';
import { startTransition, lazy, Suspense, useState, useEffect, useSyncExternalStore } from 'react';
import { RoutePosition } from './components/RoutePosition';
import '../styles/experience.css';
const FeedbackHost = lazy(() => import('./components/FeedbackHost').then(m => ({ default: m.FeedbackHost })));
import {PageAnalytics} from './components/PageAnalytics';
import { SiteSettingsProvider } from './context/SiteSettingsContext';
import HomePage from './pages/HomePage';
import { createBrowserRouter, createMemoryRouter, RouterProvider, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
import { AuthProvider, useAuth } from './context/AuthContext';
import { SiteMeta } from './components/SiteMeta';
import { SitePage, ContentSkeleton } from './components/ContentUI';
import { ThemeProvider } from './context/ThemeContext';

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
  const {pathname} = useLocation();
  return <SitePage>{/^\/(login|register)$/.test(pathname) ? <section className="auth-route-skeleton" aria-label="正在加载表单"><ContentSkeleton/></section> : <ContentSkeleton />}</SitePage>;
}

function SiteRoutes() {
  const status=useDocumentStatus(), location=useLocation();
  const [initialKey]=useState(location.key);
  const [interactive, setInteractive] = useState(false);
  useEffect(() => { startTransition(()=>setInteractive(true)); }, []);
  return <><NavigationProtection/><RoutePreload/>
          <SiteMeta /><DeferredFeedbackHost/>
          <RoutePosition /><PageAnalytics /><DiagnosticNavigation />
          <Suspense fallback={<RouteLoader />}>{status && status>=400 && location.key===initialKey ? (status===404 ? <NotFoundPage/> : <RouteFailure/>) : (location.pathname==='/'?<HomePage/>:<RoutePages/>)}</Suspense>
          {interactive && <><PublicWeatherCompanion /><Suspense fallback={null}><ReadingTools /></Suspense></>}
  </>;
}
function RouteFailure() {
  return <SitePage><section className="resource-notice" role="alert"><div><h1>页面暂时未能加载</h1><p>请重新加载页面后继续。</p></div><button className="quiet-button" onClick={()=>window.location.reload()}>重新加载</button></section></SitePage>;
}
export default function App({url, documentData}: {url?:string; documentData?:DocumentData} = {}) {
  const [router] = useState(() => { const routes=[{path:'*',element:<SiteRoutes/>,errorElement:<RouteFailure/>}]; return url ? createMemoryRouter(routes,{initialEntries:[url]}) : createBrowserRouter(routes); });
  return <DocumentDataProvider data={documentData}><ThemeProvider><SiteSettingsProvider><AuthProvider><RouterProvider router={router}/></AuthProvider></SiteSettingsProvider></ThemeProvider></DocumentDataProvider>;
}
