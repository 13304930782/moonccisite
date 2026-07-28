import { motion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Folder } from '../components/Folder';
import { Header } from '../components/Header';
import { SiteFooter } from '../components/SiteFooter';
import { api } from '../lib/api';

const previewCategories = [
  { category: '前端开发', count: null },
  { category: '后端工程', count: null },
  { category: '系统设计', count: null },
];

const folderColors = ['#ffe17c', '#b7c6c2', '#ffffff'];

export default function CategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    api('/posts/meta/categories')
      .then((data) => setCategories(Array.isArray(data) ? data : previewCategories))
      .catch(() => setCategories(previewCategories));
  }, []);

  return (
    <div className="neo-page">
      <Header />

      <main className="mx-auto max-w-7xl px-5 pb-24 pt-32 lg:px-6 lg:pt-36">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="border-b-2 border-black pb-10"
        >
          <Link to="/" className="neo-kicker">← 返回首页</Link>
          <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_0.65fr] lg:items-end">
            <h1 className="neo-heading text-[clamp(3.5rem,8vw,7rem)] text-black">内容分类</h1>
            <p className="max-w-xl text-base font-bold leading-8 text-black/65 lg:justify-self-end">
              像翻开一组工作文件夹那样探索内容。点击文件夹可以展开纸张，再进入对应主题继续阅读。
            </p>
          </div>
        </motion.div>

        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {categories.map((item, index) => (
            <motion.article
              key={item.category}
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06, duration: 0.4 }}
              className="neo-card flex min-h-[330px] flex-col items-center overflow-hidden p-6 text-center"
            >
              <div className="flex min-h-[168px] items-center justify-center">
                <Folder
                  color={folderColors[index % folderColors.length]}
                  label={`展开${item.category}文件夹`}
                  items={[
                    <span key="count">{item.count ?? 'NEW'}<br />篇文章</span>,
                    <span key="topic">TOPIC<br />{String(index + 1).padStart(2, '0')}</span>,
                    <span key="read">OPEN<br />NOTES</span>,
                  ]}
                />
              </div>

              <span className="mt-2 font-mono text-xs font-black uppercase tracking-[0.16em] text-black/45">
                Folder {String(index + 1).padStart(2, '0')}
              </span>
              <h2 className="neo-heading mt-3 text-3xl text-black">{item.category}</h2>
              <p className="mt-3 text-sm font-bold text-black/55">
                {item.count == null ? '持续整理中' : `${item.count} 篇文章`}
              </p>

              <Link
                to={`/category/${encodeURIComponent(item.category)}`}
                className="neo-button mt-auto w-full justify-center"
              >
                打开分类
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </motion.article>
          ))}

          {categories.length === 0 && (
            <div className="neo-card col-span-full p-10 text-center font-black text-black/55">
              暂无分类，新的内容正在整理中。
            </div>
          )}
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
