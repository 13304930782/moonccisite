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
const SessionsPage=lazy(()=>import('./pages/SessionsPage'));
const OperationsPage=lazy(()=>import('./pages/OperationsPage'));
const NotificationsPage=lazy(()=>import('./pages/NotificationsPage'));
const ReadingHistoryPage=lazy(()=>import('./pages/ReadingHistoryPage'));
const SeriesPage=lazy(()=>import('./pages/SeriesPage'));
const AdminSeriesPage=lazy(()=>import('./pages/AdminSeriesPage'));
const AccountWorkspace=lazy(()=>import('./components/AccountWorkspace').then(m=>({default:m.AccountWorkspace})));
const SubmissionsPage = lazy(() => import('./pages/SubmissionsPage'));
const PublishingQueuePage = lazy(() => import('./pages/PublishingQueuePage'));
const AboutPage=lazy(()=>import('./pages/BlogInfoPages').then(m=>({default:m.AboutPage})));
const LinksPage=lazy(()=>import('./pages/BlogInfoPages').then(m=>({default:m.LinksPage})));
const AdminBlogPages=lazy(()=>import('./pages/AdminBlogPages'));
const ArchivesPage = lazy(() => import('./pages/ArchivesPage'));
import {PageAnalytics} from './components/PageAnalytics';
import { SiteSettingsProvider } from './context/SiteSettingsContext';
const MailSetupPage = lazy(() => import('./pages/MailSetupPage'));
const DiagnosticsPage = lazy(() => import('./pages/DiagnosticsPage'));
const RssPage = lazy(() => import('./pages/RssPage'));
import HomePage from './pages/HomePage';
const UpdatesPage = lazy(() => loadPage('/updates'));
const UpdateDetailPage = lazy(() => import('./pages/UpdatesPage').then(m => ({ default: m.UpdateDetailPage })));
const ProjectsPage = lazy(() => loadPage('/projects'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectsPage').then(m => ({ default: m.ProjectDetailPage })));
const SubscriptionPage = lazy(() => import('./pages/SubscriptionPage'));
const AdminUpdatesPage = lazy(() => import('./pages/AdminContentPage').then(m => ({ default: m.AdminUpdatesPage })));
const AdminProjectsPage = lazy(() => import('./pages/AdminContentPage').then(m => ({ default: m.AdminProjectsPage })));
const AdminNewsletterPage = lazy(() => import('./pages/AdminContentPage').then(m => ({ default: m.AdminNewsletterPage })));
import { createBrowserRouter, createMemoryRouter, RouterProvider, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const LoginPage = lazy(() => loadPage('/login'));
const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage'));
const RegisterPage = lazy(() => loadPage('/register'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const AdminRuntimePage = lazy(() => import('./pages/AdminRuntimePage'));
const AdminAnalyticsPage = lazy(() => import('./pages/AdminAnalyticsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const AdminPostsPage = lazy(() => import('./pages/AdminPostsPage'));
const AdminWritePage = lazy(() => import('./pages/AdminWritePage'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage'));
const AdminCommentsPage = lazy(() => import('./pages/AdminCommentsPage'));
const AdminBannedWordsPage = lazy(() => import('./pages/AdminBannedWordsPage'));
const EditorApplyPage = lazy(() => import('./pages/EditorApplyPage'));
const AdminEditorApplicationsPage = lazy(() => import('./pages/AdminEditorApplicationsPage'));
const AdminSiteSettingsPage = lazy(() => import('./pages/AdminSiteSettingsPage'));
const AdminLoginSettingsPage = lazy(() => import('./pages/AdminLoginSettingsPage'));
const BookmarksPage = lazy(() => import('./pages/BookmarksPage'));
const AccountSettingsPage = lazy(() => import('./pages/AccountSettingsPage'));
const AdminUserSettingsPage = lazy(() => import('./pages/AdminUserSettingsPage'));
const CompleteRegistrationPage = lazy(() => import('./pages/CompleteRegistrationPage'));
const AdminMailSettingsPage = lazy(() => import('./pages/AdminMailSettingsPage'));
const AdminSendMailPage = lazy(() => import('./pages/AdminSendMailPage'));
const MailboxPage = lazy(() => import('./pages/MailboxPage'));
const AdminMailboxRequestsPage = lazy(() => import('./pages/AdminMailboxRequestsPage'));
const AdminMediaPage = lazy(() => import('./pages/AdminMediaPage'));
const ArticlePage = lazy(() => loadPage('/article'));
const ArticlesPage = lazy(() => loadPage('/articles'));
const TagPage = lazy(() => import('./pages/TagPage'));
const TagsPage = lazy(() => import('./pages/TagsPage'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'));
const SearchPage = lazy(() => loadPage('/search'));
const EarlyAccessPage = lazy(() => loadPage('/early-access'));
const AdminEarlyAccessPage = lazy(() => import('./pages/AdminEarlyAccessPage'));
const AdminEarlyAccessDetailPage = lazy(() => import('./pages/AdminEarlyAccessDetailPage'));
import { AuthProvider, useAuth } from './context/AuthContext';
const AdminShell = lazy(() => import('./components/admin/AdminShell').then(m => ({default:m.AdminShell})));
import { SiteMeta } from './components/SiteMeta';
import { SitePage, ContentSkeleton } from './components/ContentUI';
import { ThemeProvider } from './context/ThemeContext';

const ElectricityPage = lazy(() => loadPage('/electricity'));
const AdminElectricityPage = lazy(() => import('./pages/AdminElectricityPage'));
const ReadingTools = lazy(() => import('./components/ReadingTools'));
const WeatherCompanion = lazy(() => import('./components/WeatherCompanion'));
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

function isAdminRole(role?: string) {
  return role === 'owner' || role === 'admin';
}

function isWriterRole(role?: string) {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

function isOwnerRole(role?: string) {
  return role === 'owner';
}

function Guard({
  children,
  adminOnly = false,
  ownerOnly = false,
  writerOnly = false,
}: {
  children: any;
  adminOnly?: boolean;
  ownerOnly?: boolean;
  writerOnly?: boolean;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        正在恢复登录状态...
      </div>
    );
  }

  if (!user) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  const denied=ownerOnly&&!isOwnerRole(user.role)?'站长':adminOnly&&!isAdminRole(user.role)?'管理员或站长':writerOnly&&!isWriterRole(user.role)?'编辑、管理员或站长':'';
  if(denied)return <main className="site-container page-content"><section className="quiet-state" role="status"><h1>当前账号无法访问此页面</h1><p>此功能需要{denied}权限，你的登录状态仍然有效。</p><div className="inline-actions"><Link className="quiet-button" to="/account/submissions">去我的投稿</Link><Link className="text-link" to="/account/settings">返回个人中心</Link>{isWriterRole(user.role)&&<Link className="text-link" to="/admin">返回后台</Link>}<Link className="text-link" to="/">返回网站</Link></div></section></main>;

  return children;
}

function SiteRoutes() {
  const status=useDocumentStatus(), location=useLocation();
  const [initialKey]=useState(location.key);
  const [interactive, setInteractive] = useState(false);
  useEffect(() => { startTransition(()=>setInteractive(true)); }, []);
  return <><NavigationProtection/><RoutePreload/>
          <SiteMeta /><DeferredFeedbackHost/>
          <RoutePosition /><PageAnalytics /><DiagnosticNavigation />
          <Suspense fallback={<RouteLoader />}>{status && status>=400 && location.key===initialKey ? (status===404 ? <NotFoundPage/> : <RouteFailure/>) : <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/updates" element={<UpdatesPage/>}/>
          <Route path="/updates/:id" element={<UpdateDetailPage/>}/>
          <Route path="/projects" element={<ProjectsPage/>}/>
          <Route path="/projects/:slug" element={<ProjectDetailPage/>}/>
          <Route path="/mail-setup" element={<MailSetupPage/>}/>
          <Route path="/diagnostics" element={<DiagnosticsPage/>}/>
          <Route path="/rss" element={<RssPage/>}/>
          <Route path="/subscription/:action" element={<SubscriptionPage/>}/>
          <Route path="/admin/updates" element={<Guard adminOnly><AdminShell><AdminUpdatesPage/></AdminShell></Guard>}/>
          <Route path="/admin/projects" element={<Guard adminOnly><AdminShell><AdminProjectsPage/></AdminShell></Guard>}/>
          <Route path="/admin/newsletter" element={<Guard ownerOnly><AdminShell><AdminNewsletterPage/></AdminShell></Guard>}/>
          <Route path="/about" element={<AboutPage/>}/><Route path="/links" element={<LinksPage/>}/><Route path="/admin/blog-pages" element={<Guard adminOnly><AdminShell><AdminBlogPages/></AdminShell></Guard>}/>
          <Route path="/archives" element={<ArchivesPage/>}/>
          <Route path="/series" element={<SeriesPage/>}/><Route path="/series/:slug" element={<SeriesPage/>}/><Route path="/admin/series" element={<Guard adminOnly><AdminShell><AdminSeriesPage/></AdminShell></Guard>}/>
<Route path="/articles" element={<ArticlesPage />} />
          <Route path="/tag/:tag" element={<TagPage />} />
          <Route path="/tags" element={<TagsPage />} />
          <Route path="/category/:category" element={<CategoryPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/article/:id" element={<ArticlePage />} />
          <Route path="/early-access" element={<EarlyAccessPage />} />
          <Route path="/electricity" element={<Suspense fallback={<RouteLoader />}><ElectricityPage /></Suspense>} />

          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin-login" element={<AdminLoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route path="/admin" element={<Guard writerOnly><AdminShell><AdminPage /></AdminShell></Guard>} />
          <Route path="/admin/posts" element={<Guard writerOnly><AdminShell><AdminPostsPage /></AdminShell></Guard>} />
          <Route path="/admin/write" element={<Guard writerOnly><AdminShell><AdminWritePage /></AdminShell></Guard>} />
          <Route path="/admin/media" element={<Guard adminOnly><AdminShell><AdminMediaPage /></AdminShell></Guard>} />
          <Route path="/admin/posts/:id/edit" element={<Guard writerOnly><AdminShell><AdminWritePage /></AdminShell></Guard>} />
          <Route path="/admin/runtime" element={<Guard adminOnly><AdminShell><AdminRuntimePage /></AdminShell></Guard>} />
          <Route path="/admin/analytics" element={<Guard adminOnly><AdminShell><AdminAnalyticsPage /></AdminShell></Guard>} />
          <Route path="/admin/users" element={<Guard adminOnly><AdminShell><AdminUsersPage /></AdminShell></Guard>} />
          <Route path="/admin/comments" element={<Guard adminOnly><AdminShell><AdminCommentsPage /></AdminShell></Guard>} />
          <Route path="/admin/banned-words" element={<Guard adminOnly><AdminShell><AdminBannedWordsPage /></AdminShell></Guard>} />
          <Route path="/admin/editor-apply" element={<Guard><AdminShell><EditorApplyPage /></AdminShell></Guard>} />
          <Route path="/admin/editor-applications" element={<Guard adminOnly><AdminShell><AdminEditorApplicationsPage /></AdminShell></Guard>} />
          <Route path="/admin/site-settings" element={<Guard adminOnly><AdminShell><AdminSiteSettingsPage /></AdminShell></Guard>} />
          <Route path="/complete-registration" element={<CompleteRegistrationPage />} />
          <Route path="/account/connections" element={<Navigate to="/account/settings" replace />} />
          <Route path="/account/notifications" element={<Guard><AccountWorkspace><NotificationsPage/></AccountWorkspace></Guard>}/>
<Route path="/account/sessions" element={<Guard><AccountWorkspace><SessionsPage/></AccountWorkspace></Guard>}/>
<Route path="/admin/operations" element={<Guard adminOnly><AdminShell><OperationsPage/></AdminShell></Guard>}/>
<Route path="/account/history" element={<Guard><AccountWorkspace><ReadingHistoryPage/></AccountWorkspace></Guard>}/>
<Route path="/account/bookmarks" element={<Guard><AccountWorkspace><BookmarksPage /></AccountWorkspace></Guard>} />
          <Route path="/account/settings" element={<Guard><AccountWorkspace><AccountSettingsPage /></AccountWorkspace></Guard>} />
          <Route path="/account/mailbox" element={<Guard><AccountWorkspace><MailboxPage /></AccountWorkspace></Guard>} />
<Route path="/account/submissions" element={<Guard><AccountWorkspace><SubmissionsPage /></AccountWorkspace></Guard>} />
<Route path="/account/write" element={<Guard><AccountWorkspace><AdminWritePage /></AccountWorkspace></Guard>} />
<Route path="/admin/reviews" element={<Guard adminOnly><AdminShell><PublishingQueuePage key="reviews" /></AdminShell></Guard>} />
<Route path="/admin/schedules" element={<Guard adminOnly><AdminShell><PublishingQueuePage key="schedules" plans /></AdminShell></Guard>} />
          <Route path="/admin/users/:id/settings" element={<Guard adminOnly><AdminShell><AdminUserSettingsPage /></AdminShell></Guard>} />
          <Route path="/admin/login-settings" element={<Guard ownerOnly><AdminShell><AdminLoginSettingsPage /></AdminShell></Guard>} />
          <Route path="/admin/mail-settings" element={<Guard adminOnly><AdminShell><AdminMailSettingsPage /></AdminShell></Guard>} />
          <Route path="/admin/send-mail" element={<Guard adminOnly><AdminShell><AdminSendMailPage /></AdminShell></Guard>} />
          <Route path="/admin/mailbox" element={<Guard><AdminShell><MailboxPage /></AdminShell></Guard>} />
          <Route path="/admin/mailbox-requests" element={<Guard ownerOnly><AdminShell><AdminMailboxRequestsPage /></AdminShell></Guard>} />
          <Route path="/admin/early-access" element={<Guard ownerOnly><AdminShell><AdminEarlyAccessPage /></AdminShell></Guard>} />
          <Route path="/admin/early-access/:id" element={<Guard ownerOnly><AdminShell><AdminEarlyAccessDetailPage /></AdminShell></Guard>} />
          <Route path="/admin/electricity" element={<Guard ownerOnly><AdminShell><Suspense fallback={<RouteLoader />}><AdminElectricityPage /></Suspense></AdminShell></Guard>} />

          <Route path="*" element={<NotFoundPage />} />
          </Routes>}</Suspense>
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
