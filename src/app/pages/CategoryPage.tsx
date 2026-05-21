import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { BlogCard } from '../components/BlogCard';
import { api } from '../lib/api';

export default function CategoryPage() {
  const { category = '' } = useParams();
  const name = decodeURIComponent(category);

  const [posts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    api(`/posts?category=${encodeURIComponent(name)}`)
      .then(setPosts)
      .catch(() => setPosts([]));
  }, [name]);

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
          <Link to="/categories" className="text-sm text-blue-600 hover:underline">
            返回分类
          </Link>

          <h1 className="mt-4 text-4xl md:text-5xl font-bold text-gray-900 dark:text-white">
            分类：{name}
          </h1>

          <p className="mt-4 text-gray-600 dark:text-gray-300">
            共 {posts.length} 篇文章
          </p>
        </motion.div>

        {posts.length === 0 && (
          <div className="rounded-3xl bg-white/80 dark:bg-gray-900/80 p-8 text-gray-500">
            这个分类下还没有文章。
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post, index) => {
            let tags: string[] = [];

            try {
              tags = Array.isArray(post.tags) ? post.tags : JSON.parse(post.tags || '[]');
            } catch {
              tags = [];
            }

            return (
              <BlogCard
                key={post.id}
                id={post.id}
                title={post.title}
                excerpt={post.summary}
                date={post.created_at?.slice(0, 10)}
                readTime="-"
                tags={tags}
                image={post.cover_image}
                index={index}
              />
            );
          })}
        </div>
      </main>
    </div>
  );
}
