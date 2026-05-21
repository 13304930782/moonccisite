import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { BlogCard } from '../components/BlogCard';
import { api } from '../lib/api';

export default function ArticlesPage() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/posts')
      .then(setPosts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <Header />

      <main className="max-w-7xl mx-auto px-6 pt-32 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10"
        >
          <Link to="/" className="text-sm text-blue-600 hover:underline">
            返回首页
          </Link>

          <h1 className="mt-4 text-4xl md:text-5xl font-bold text-gray-900 dark:text-white">
            文章
          </h1>

          <p className="mt-4 max-w-2xl text-gray-600 dark:text-gray-300 leading-relaxed">
            这里收录所有已发布文章。首页只展示最新内容，完整内容会集中在这个独立文章板块中。
          </p>
        </motion.div>

        {loading && (
          <div className="rounded-3xl bg-white/80 dark:bg-gray-900/80 p-8 text-gray-500">
            正在加载文章...
          </div>
        )}

        {!loading && posts.length === 0 && (
          <div className="rounded-3xl bg-white/80 dark:bg-gray-900/80 p-8 text-gray-500">
            还没有发布文章。
          </div>
        )}

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
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {posts.map((post, index) => {
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
      </main>
    </div>
  );
}
