import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { BlogCard } from './components/BlogCard';
import { Sidebar } from './components/Sidebar';
import { SiteFooter } from './components/SiteFooter';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
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

function RouteLoader() {
  return <div className="min-h-screen grid place-items-center font-bold">正在加载页面…</div>;
}

function Home() {
  const [blogPosts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    api('/posts').then((data) => setPosts(Array.isArray(data) ? data : [])).catch(() => setPosts([]));
  }, []);

  const latestPosts = blogPosts.slice(0, 4);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      className="neo-page"
    >
      <Header />

      <main>
        <Hero />

        <section className="overflow-hidden border-b-2 border-black bg-[#171e19] py-5 text-[#b7c6c2]" aria-label="内容主题">
          <div className="neo-marquee-track">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 items-center gap-12 px-6">
                {['REACT', 'TYPESCRIPT', 'NODE.JS', 'MYSQL', 'SYSTEM DESIGN', 'OPEN SOURCE'].map((topic) => (
                  <span key={`${copy}-${topic}`} className="neo-heading whitespace-nowrap text-3xl opacity-60 md:text-4xl">
                    {topic} <span className="ml-10 text-[#ffe17c]">✦</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section id="latest" className="mx-auto max-w-7xl px-5 py-20 lg:px-6 lg:py-24">
          <div className="mb-12 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
            <div>
              <span className="neo-kicker bg-[#b7c6c2]">01 / Latest notes</span>
              <h2 className="neo-heading mt-6 text-5xl text-black md:text-6xl">最近写了什么</h2>
              <p className="mt-4 max-w-2xl text-sm font-bold leading-7 text-black/60 md:text-base">
                不追热点清单，记录那些值得反复翻阅的工程经验和技术判断。
              </p>
            </div>

            <Link to="/articles" className="neo-button neo-button-yellow shrink-0">
              查看全部文章 <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
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
                className="grid grid-cols-1 gap-7 md:grid-cols-2"
              >
                {latestPosts.length === 0 && (
                  <div className="neo-card col-span-full rounded-[12px] bg-[#ffe17c] p-8 font-black">
                    还没有发布文章，第一篇内容正在路上。
                  </div>
                )}

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
              <div className="sticky top-28">
                <Sidebar />
              </div>
            </div>
          </div>
        </section>

        <section className="border-y-2 border-black bg-[#ffe17c] px-5 py-20 lg:px-6 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-3xl">
              <span className="neo-kicker">02 / What you will find</span>
              <h2 className="neo-heading mt-6 text-5xl md:text-6xl">不只是代码片段</h2>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                { icon: Code2, title: '工程实战', text: '从真实项目出发，保留约束、取舍和踩坑过程，而不是只展示最终答案。' },
                { icon: Compass, title: '系统视角', text: '把前端、后端、数据库与部署串起来，理解一个功能如何真正落地。' },
                { icon: Lightbulb, title: '长期思考', text: '记录技术之外的判断：怎样学习、怎样维护、怎样做更好的选择。' },
              ].map(({ icon: Icon, title, text }, index) => (
                <article key={title} className="group rounded-[12px] border-2 border-black bg-white p-6 shadow-[6px_6px_0_#000]">
                  <div className="flex items-start justify-between">
                    <span className="flex h-14 w-14 items-center justify-center border-2 border-black bg-[#b7c6c2] transition-colors group-hover:bg-[#ffe17c]">
                      <Icon className="h-6 w-6" />
                    </span>
                    <span className="font-mono text-sm font-black">0{index + 1}</span>
                  </div>
                  <h3 className="neo-heading mt-10 text-3xl">{title}</h3>
                  <p className="mt-4 text-sm font-bold leading-7 text-black/65">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#171e19] px-5 py-20 text-white lg:px-6 lg:py-24">
          <div className="mx-auto max-w-7xl">
            <span className="neo-kicker border-white bg-[#171e19] text-white shadow-[3px_3px_0_#b7c6c2]">03 / Reading flow</span>
            <h2 className="neo-heading mt-7 max-w-3xl text-5xl md:text-6xl">找到主题，建立连接，带走方法。</h2>

            <div className="relative mt-14 grid gap-8 md:grid-cols-3">
              <div className="absolute left-[16%] right-[16%] top-10 hidden h-0.5 bg-white/20 md:block" />
              {[
                { icon: Compass, number: '01', title: '按主题探索', text: '从分类或标签进入，快速定位你当前关心的问题。', color: '#b7c6c2' },
                { icon: BookMarked, number: '02', title: '读完整上下文', text: '不仅看结论，也理解它在什么条件下成立。', color: '#ffe17c' },
                { icon: Lightbulb, number: '03', title: '形成自己的答案', text: '把方法带回项目，在实践里继续修正。', color: '#ffffff' },
              ].map(({ icon: Icon, number, title, text, color }) => (
                <div key={number} className="relative z-10">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 bg-[#171e19]" style={{ borderColor: color, boxShadow: `0 0 0 4px #b7c6c2` }}>
                    <Icon className="h-7 w-7" style={{ color }} />
                  </div>
                  <div className="mt-7 font-mono text-xs font-black tracking-widest text-[#b7c6c2]">STEP {number}</div>
                  <h3 className="neo-heading mt-3 text-3xl">{title}</h3>
                  <p className="mt-4 max-w-sm text-sm font-bold leading-7 text-white/60">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="neo-dot-grid border-t-2 border-black px-5 py-20 text-center lg:px-6 lg:py-24">
          <div className="mx-auto max-w-4xl">
            <span className="neo-kicker">Ready when you are</span>
            <h2 className="neo-heading mt-7 text-5xl md:text-7xl">下一篇笔记，也许正好回答你的问题。</h2>
            <Link to="/articles" className="neo-button neo-button-dark mt-10 px-7 py-4">
              进入文章库 <ArrowRight className="h-5 w-5" />
            </Link>
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
      <div className="min-h-screen flex items-center justify-center text-gray-500">
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
          <Route path="/admin/early-access" element={<Guard ownerOnly><AdminShell><AdminEarlyAccessPage /></AdminShell></Guard>} />
          <Route path="/admin/early-access/:id" element={<Guard ownerOnly><AdminShell><AdminEarlyAccessDetailPage /></AdminShell></Guard>} />
          <Route path="/admin/electricity" element={<Guard ownerOnly><AdminShell><Suspense fallback={<RouteLoader />}><AdminElectricityPage /></Suspense></AdminShell></Guard>} />

          <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
