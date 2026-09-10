import { SiteSettingsProvider } from './context/SiteSettingsContext';
const RssPage = lazy(() => import('./pages/RssPage'));
import HomePage from './pages/HomePage';
const UpdatesPage = lazy(() => import('./pages/UpdatesPage'));
const UpdateDetailPage = lazy(() => import('./pages/UpdatesPage').then(m => ({ default: m.UpdateDetailPage })));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('./pages/ProjectsPage').then(m => ({ default: m.ProjectDetailPage })));
const SubscriptionPage = lazy(() => import('./pages/SubscriptionPage'));
const AdminUpdatesPage = lazy(() => import('./pages/AdminContentPage').then(m => ({ default: m.AdminUpdatesPage })));
const AdminProjectsPage = lazy(() => import('./pages/AdminContentPage').then(m => ({ default: m.AdminProjectsPage })));
const AdminNewsletterPage = lazy(() => import('./pages/AdminContentPage').then(m => ({ default: m.AdminNewsletterPage })));
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { lazy, Suspense, useLayoutEffect } from 'react';
const LoginPage = lazy(() => import('./pages/LoginPage'));
const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
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
const AccountSettingsPage = lazy(() => import('./pages/AccountSettingsPage'));
const AdminUserSettingsPage = lazy(() => import('./pages/AdminUserSettingsPage'));
const CompleteRegistrationPage = lazy(() => import('./pages/CompleteRegistrationPage'));
const AdminMailSettingsPage = lazy(() => import('./pages/AdminMailSettingsPage'));
const AdminSendMailPage = lazy(() => import('./pages/AdminSendMailPage'));
const AdminMediaPage = lazy(() => import('./pages/AdminMediaPage'));
const ArticlePage = lazy(() => import('./pages/ArticlePage'));
const ArticlesPage = lazy(() => import('./pages/ArticlesPage'));
const TagPage = lazy(() => import('./pages/TagPage'));
const TagsPage = lazy(() => import('./pages/TagsPage'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const EarlyAccessPage = lazy(() => import('./pages/EarlyAccessPage'));
const AdminEarlyAccessPage = lazy(() => import('./pages/AdminEarlyAccessPage'));
const AdminEarlyAccessDetailPage = lazy(() => import('./pages/AdminEarlyAccessDetailPage'));
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminShell } from './components/admin/AdminShell';
import { SiteMeta } from './components/SiteMeta';
import { SitePage, ContentSkeleton } from './components/ContentUI';
import { ThemeProvider } from './context/ThemeContext';

const ElectricityPage = lazy(() => import('./pages/ElectricityPage'));
const AdminElectricityPage = lazy(() => import('./pages/AdminElectricityPage'));
const WeatherCompanion = lazy(() => import('./components/WeatherCompanion'));
function PublicWeatherCompanion() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin')) return null;
  return <Suspense fallback={null}><WeatherCompanion /></Suspense>;
}

function RouteLoader() {
  return <SitePage><ContentSkeleton /></SitePage>;
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        正在恢复登录状态...
      </div>
    );
  }

  if (!user) return <Navigate to="/login" />;
  if (ownerOnly && !isOwnerRole(user.role)) return <Navigate to="/admin" />;
  if (adminOnly && !isAdminRole(user.role)) return <Navigate to="/admin" />;
  if (writerOnly && !isWriterRole(user.role)) return <Navigate to="/admin/editor-apply" />;

  return children;
}

function ScrollToPageTop() {
  const { pathname } = useLocation();
  useLayoutEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <SiteSettingsProvider>
      <AuthProvider>
        <SiteMeta />
        <BrowserRouter>
          <ScrollToPageTop />
          <Suspense fallback={<RouteLoader />}><Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/updates" element={<UpdatesPage/>}/>
          <Route path="/updates/:id" element={<UpdateDetailPage/>}/>
          <Route path="/projects" element={<ProjectsPage/>}/>
          <Route path="/projects/:slug" element={<ProjectDetailPage/>}/>
          <Route path="/rss" element={<RssPage/>}/>
          <Route path="/subscription/:action" element={<SubscriptionPage/>}/>
          <Route path="/admin/updates" element={<Guard adminOnly><AdminShell><AdminUpdatesPage/></AdminShell></Guard>}/>
          <Route path="/admin/projects" element={<Guard adminOnly><AdminShell><AdminProjectsPage/></AdminShell></Guard>}/>
          <Route path="/admin/newsletter" element={<Guard ownerOnly><AdminShell><AdminNewsletterPage/></AdminShell></Guard>}/>
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
          <Route path="/admin/users" element={<Guard adminOnly><AdminShell><AdminUsersPage /></AdminShell></Guard>} />
          <Route path="/admin/comments" element={<Guard adminOnly><AdminShell><AdminCommentsPage /></AdminShell></Guard>} />
          <Route path="/admin/banned-words" element={<Guard adminOnly><AdminShell><AdminBannedWordsPage /></AdminShell></Guard>} />
          <Route path="/admin/editor-apply" element={<Guard><AdminShell><EditorApplyPage /></AdminShell></Guard>} />
          <Route path="/admin/editor-applications" element={<Guard adminOnly><AdminShell><AdminEditorApplicationsPage /></AdminShell></Guard>} />
          <Route path="/admin/site-settings" element={<Guard adminOnly><AdminShell><AdminSiteSettingsPage /></AdminShell></Guard>} />
          <Route path="/complete-registration" element={<CompleteRegistrationPage />} />
          <Route path="/account/connections" element={<Navigate to="/account/settings" replace />} />
          <Route path="/account/settings" element={<Guard><AccountSettingsPage /></Guard>} />
          <Route path="/admin/users/:id/settings" element={<Guard adminOnly><AdminShell><AdminUserSettingsPage /></AdminShell></Guard>} />
          <Route path="/admin/login-settings" element={<Guard ownerOnly><AdminShell><AdminLoginSettingsPage /></AdminShell></Guard>} />
          <Route path="/admin/mail-settings" element={<Guard adminOnly><AdminShell><AdminMailSettingsPage /></AdminShell></Guard>} />
          <Route path="/admin/send-mail" element={<Guard adminOnly><AdminShell><AdminSendMailPage /></AdminShell></Guard>} />
          <Route path="/admin/early-access" element={<Guard ownerOnly><AdminShell><AdminEarlyAccessPage /></AdminShell></Guard>} />
          <Route path="/admin/early-access/:id" element={<Guard ownerOnly><AdminShell><AdminEarlyAccessDetailPage /></AdminShell></Guard>} />
          <Route path="/admin/electricity" element={<Guard ownerOnly><AdminShell><Suspense fallback={<RouteLoader />}><AdminElectricityPage /></Suspense></AdminShell></Guard>} />

          <Route path="*" element={<Navigate to="/" />} />
          </Routes></Suspense>
          <PublicWeatherCompanion />
        </BrowserRouter>
      </AuthProvider>
      </SiteSettingsProvider>
    </ThemeProvider>
  );
}
