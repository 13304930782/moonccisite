import { motion } from 'motion/react';
import { Tag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/Header';
import { api } from '../lib/api';

export default function TagsPage() {
  const [tags, setTags] = useState<any[]>([]);

  useEffect(() => {
    api('/posts/meta/tags')
      .then(setTags)
      .catch(() => setTags([]));
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
            标签
          </h1>

          <p className="mt-4 text-gray-600 dark:text-gray-300">
            按关键词浏览文章。
          </p>
        </motion.div>

        <div className="mt-10 flex flex-wrap gap-3">
          {tags.map((item) => (
            <Link
              key={item.tag}
              to={`/tag/${encodeURIComponent(item.tag)}`}
              className="inline-flex items-center gap-2 rounded-full bg-white/85 dark:bg-gray-900/85 border border-gray-200 dark:border-gray-800 px-5 py-3 text-gray-700 dark:text-gray-200 shadow-lg hover:-translate-y-0.5 hover:text-blue-600 transition-all"
            >
              <Tag className="w-4 h-4" />
              {item.tag}
              <span className="text-xs text-gray-400">{item.count}</span>
            </Link>
          ))}

          {tags.length === 0 && (
            <div className="rounded-3xl bg-white/80 dark:bg-gray-900/80 p-8 text-gray-500">
              暂无标签。
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
