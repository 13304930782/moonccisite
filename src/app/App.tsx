import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { BlogCard } from './components/BlogCard';
import { Sidebar } from './components/Sidebar';
import { SiteFooter } from './components/SiteFooter';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
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
import { AuthProvider, useAuth } from './context/AuthContext';
import { AdminShell } from './components/admin/AdminShell';
import { SiteMeta } from './components/SiteMeta';

function Home() {
  const [blogPosts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    api('/posts').then(setPosts).catch(() => {});
  }, []);

  const latestPosts = blogPosts.slice(0, 4);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950"
    >
      <Header />

      <main>
        <Hero />

        <section id="latest" className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <div className="mb-8 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                    最新文章
                  </h2>
                  <p className="text-sm text-gray-500">
                    这里只展示最近更新的几篇，完整文章请进入文章板块。
                  </p>
                </div>

                <Link
                  to="/articles"
                  className="shrink-0 rounded-full bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 transition-colors"
                >
                  查看全部
                </Link>
              </div>

              <motion.div
                initial="hidden"
                animate="show"
                variants={{
                  hidden: {},
                  show: {
                    transition: {
                      staggerChildren: 0.08,
                    },
                  },
                }}
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                {latestPosts.length === 0 && <p className="text-gray-500">还没有发布文章。</p>}

                {latestPosts.map((post, index) => {
                  let tags: string[] = [];

                  try {
                    tags = Array.isArray(post.tags) ? post.tags : JSON.parse(post.tags || '[]');
                  } catch {
                    tags = [];
                  }

                  return (
                    <motion.div
                      key={post.id}
                      variants={{
                        hidden: { opacity: 0, y: 24 },
                        show: { opacity: 1, y: 0 },
                      }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <BlogCard
                        id={post.id}
                        title={post.title}
                        excerpt={post.summary}
                        date={post.created_at?.slice(0, 10)}
                        readTime="-"
                        tags={tags}
                        image={post.cover_image}
                        index={index}
                      />
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>

            <div className="lg:col-span-1">
              <div className="sticky top-24">
                <Sidebar />
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </motion.div>
  );
}

function isAdminRole(role?: string) {
  return role === 'owner' || role === 'admin';
}

function isWriterRole(role?: string) {
  return role === 'owner' || role === 'admin' || role === 'editor';
}

function Guard({
  children,
  adminOnly = false,
  writerOnly = false,
}: {
  children: any;
  adminOnly?: boolean;
  writerOnly?: boolean;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        正在恢复登录状态...
      </div>
    );
  }

  if (!user) return <Navigate to="/login" />;
  if (adminOnly && !isAdminRole(user.role)) return <Navigate to="/admin" />;
  if (writerOnly && !isWriterRole(user.role)) return <Navigate to="/admin/editor-apply" />;

  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <SiteMeta />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/articles" element={<ArticlesPage />} />
          <Route path="/tag/:tag" element={<TagPage />} />
          <Route path="/tags" element={<TagsPage />} />
          <Route path="/category/:category" element={<CategoryPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/article/:id" element={<ArticlePage />} />

          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin-login" element={<AdminLoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          <Route path="/admin" element={<Guard writerOnly><AdminShell><AdminPage /></AdminShell></Guard>} />
          <Route path="/admin/posts" element={<Guard writerOnly><AdminShell><AdminPostsPage /></AdminShell></Guard>} />
          <Route path="/admin/write" element={<Guard writerOnly><AdminShell><AdminWritePage /></AdminShell></Guard>} />
          <Route path="/admin/media" element={<Guard writerOnly><AdminShell><AdminMediaPage /></AdminShell></Guard>} />
          <Route path="/admin/posts/:id/edit" element={<Guard writerOnly><AdminShell><AdminWritePage /></AdminShell></Guard>} />
          <Route path="/admin/users" element={<Guard adminOnly><AdminShell><AdminUsersPage /></AdminShell></Guard>} />
          <Route path="/admin/comments" element={<Guard adminOnly><AdminShell><AdminCommentsPage /></AdminShell></Guard>} />
          <Route path="/admin/banned-words" element={<Guard adminOnly><AdminShell><AdminBannedWordsPage /></AdminShell></Guard>} />
          <Route path="/admin/editor-apply" element={<Guard><AdminShell><EditorApplyPage /></AdminShell></Guard>} />
          <Route path="/admin/editor-applications" element={<Guard adminOnly><AdminShell><AdminEditorApplicationsPage /></AdminShell></Guard>} />
          <Route path="/admin/site-settings" element={<Guard adminOnly><AdminShell><AdminSiteSettingsPage /></AdminShell></Guard>} />
          <Route path="/admin/mail-settings" element={<Guard adminOnly><AdminShell><AdminMailSettingsPage /></AdminShell></Guard>} />
          <Route path="/admin/send-mail" element={<Guard adminOnly><AdminShell><AdminSendMailPage /></AdminShell></Guard>} />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
