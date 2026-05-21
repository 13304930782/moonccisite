import { motion } from 'motion/react';
import { FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { api } from '../lib/api';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    api('/posts/meta/categories')
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <Header />

      <main className="max-w-6xl mx-auto px-6 pt-32 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <Link to="/" className="text-sm text-blue-600 hover:underline">
            返回首页
          </Link>

          <h1 className="mt-4 text-4xl md:text-5xl font-bold text-gray-900 dark:text-white">
            分类
          </h1>

          <p className="mt-4 text-gray-600 dark:text-gray-300">
            按文章主题浏览内容。
          </p>
        </motion.div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {categories.map((item) => (
            <Link
              key={item.category}
              to={`/category/${encodeURIComponent(item.category)}`}
              className="group rounded-3xl bg-white/85 dark:bg-gray-900/85 backdrop-blur border border-white/40 dark:border-gray-800 p-6 shadow-xl hover:-translate-y-1 hover:shadow-2xl transition-all"
            >
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <FolderOpen className="w-5 h-5" />
              </div>

              <h2 className="mt-5 text-xl font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors">
                {item.category}
              </h2>

              <p className="mt-2 text-sm text-gray-500">
                {item.count} 篇文章
              </p>
            </Link>
          ))}

          {categories.length === 0 && (
            <div className="rounded-3xl bg-white/80 dark:bg-gray-900/80 p-8 text-gray-500">
              暂无分类。
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
