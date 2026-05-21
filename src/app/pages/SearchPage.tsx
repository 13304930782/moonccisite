import { motion } from 'motion/react';
import { Search } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { BlogCard } from '../components/BlogCard';
import { api } from '../lib/api';

export default function SearchPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const q = params.get('q') || '';

  const [keyword, setKeyword] = useState(q);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setKeyword(q);

    if (!q) {
      setPosts([]);
      return;
    }

    setLoading(true);

    api(`/posts?search=${encodeURIComponent(q)}`)
      .then(setPosts)
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, [q]);

  const submit = (event: FormEvent) => {
    event.preventDefault();

    const value = keyword.trim();

    if (!value) return;

    navigate(`/search?q=${encodeURIComponent(value)}`);
  };

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
            搜索文章
          </h1>

          <p className="mt-4 text-gray-600 dark:text-gray-300">
            按标题、摘要、正文、分类和标签搜索。
          </p>

          <form onSubmit={submit} className="mt-8 flex flex-col md:flex-row gap-3">
            <div className="flex-1 flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 py-3">
              <Search className="w-5 h-5 text-gray-400" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="输入关键词..."
                className="w-full bg-transparent outline-none text-gray-900 dark:text-white"
              />
            </div>

            <button className="rounded-2xl bg-blue-600 px-6 py-3 text-white hover:bg-blue-700">
              搜索
            </button>
          </form>
        </motion.div>

        {loading && <p className="text-gray-500">正在搜索...</p>}

        {!loading && q && (
          <div className="mb-6 text-sm text-gray-500">
            关键词「{q}」共找到 {posts.length} 篇文章
          </div>
        )}

        {!loading && q && posts.length === 0 && (
          <div className="rounded-3xl bg-white/80 dark:bg-gray-900/80 p-8 text-gray-500">
            没有找到相关文章。
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
