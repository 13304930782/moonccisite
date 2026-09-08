import { SiteSettingsProvider } from './context/SiteSettingsContext';
import RssPage from './pages/RssPage';
import HomePage from './pages/HomePage';
import UpdatesPage,{UpdateDetailPage} from './pages/UpdatesPage';
import ProjectsPage,{ProjectDetailPage} from './pages/ProjectsPage';
import SubscriptionPage from './pages/SubscriptionPage';
import {AdminUpdatesPage,AdminProjectsPage,AdminNewsletterPage} from './pages/AdminContentPage';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { api } from './lib/api';
import LoginPage from './pages/LoginPage';
import AdminLoginPage from './pages/AdminLoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AdminPage from './pages/AdminPage';
import AdminPostsPage from './pages/AdminPostsPage';
import AdminWritePage from './pages/AdminWritePage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminCommentsPage from './pages/AdminCommentsPage';
import AdminBannedWordsPage from './pages/AdminBannedWordsPage';
import EditorApplyPage from './pages/EditorApplyPage';
import AdminEditorApplicationsPage from './pages/AdminEditorApplicationsPage';
import AdminSiteSettingsPage from './pages/AdminSiteSettingsPage';
import AdminMailSettingsPage from './pages/AdminMailSettingsPage';
import AdminSendMailPage from './pages/AdminSendMailPage';
import AdminMediaPage from './pages/AdminMediaPage';
import ArticlePage from './pages/ArticlePage';
import ArticlesPage from './pages/ArticlesPage';
import TagPage from './pages/TagPage';
import TagsPage from './pages/TagsPage';
import CategoryPage from './pages/CategoryPage';
import CategoriesPage from './pages/CategoriesPage';
import SearchPage from './pages/SearchPage';
import EarlyAccessPage from './pages/EarlyAccessPage';
import AdminEarlyAccessPage from './pages/AdminEarlyAccessPage';
import AdminEarlyAccessDetailPage from './pages/AdminEarlyAccessDetailPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminShell } from './components/admin/AdminShell';
import { SiteMeta } from './components/SiteMeta';
import { ArrowRight, BookMarked, Code2, Compass, Lightbulb } from 'lucide-react';
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
  return <div className="min-h-screen grid place-items-center font-medium">正在加载页面…</div>;
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

export default function App() {
  return (
    <ThemeProvider>
      <SiteSettingsProvider>
      <AuthProvider>
        <SiteMeta />
        <BrowserRouter>
          <Routes>
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
          <Route path="/admin/mail-settings" element={<Guard adminOnly><AdminShell><AdminMailSettingsPage /></AdminShell></Guard>} />
          <Route path="/admin/send-mail" element={<Guard adminOnly><AdminShell><AdminSendMailPage /></AdminShell></Guard>} />
          <Route path="/admin/early-access" element={<Guard ownerOnly><AdminShell><AdminEarlyAccessPage /></AdminShell></Guard>} />
          <Route path="/admin/early-access/:id" element={<Guard ownerOnly><AdminShell><AdminEarlyAccessDetailPage /></AdminShell></Guard>} />
          <Route path="/admin/electricity" element={<Guard ownerOnly><AdminShell><Suspense fallback={<RouteLoader />}><AdminElectricityPage /></Suspense></AdminShell></Guard>} />

          <Route path="*" element={<Navigate to="/" />} />
          </Routes>
          <PublicWeatherCompanion />
        </BrowserRouter>
      </AuthProvider>
      </SiteSettingsProvider>
    </ThemeProvider>
  );
}
