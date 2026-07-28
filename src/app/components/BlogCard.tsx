import { motion } from 'motion/react';
import { ArrowUpRight, Calendar, Clock3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { safeImageSrc } from '../lib/safeUrl';

interface BlogCardProps {
  id?: number | string;
  title: string;
  excerpt: string;
  date: string;
  readTime: string;
  tags: string[];
  image: string;
  index: number;
}

export function BlogCard({ id, title, excerpt, date, readTime, tags, image, index }: BlogCardProps) {
  const imageSrc = safeImageSrc(image);
  const content = (
    <motion.article
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.06, 0.3), ease: [0.16, 1, 0.3, 1] }}
      className="group flex h-full flex-col overflow-hidden rounded-[12px] border-2 border-black bg-white shadow-[6px_6px_0_#000] transition-all duration-150 hover:translate-x-1 hover:translate-y-1 hover:shadow-[2px_2px_0_#000]"
    >
      <div className="relative h-48 overflow-hidden border-b-2 border-black bg-[#b7c6c2]">
        {imageSrc ? (
          <img src={imageSrc} alt={title} className="h-full w-full object-cover grayscale-[20%] transition duration-300 group-hover:grayscale-0" />
        ) : (
          <div className="neo-dot-grid flex h-full items-center justify-center">
            <span className="neo-heading -rotate-3 border-2 border-black bg-white px-4 py-2 text-2xl shadow-[4px_4px_0_#000]">FIELD NOTE</span>
          </div>
        )}

        <div className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center border-2 border-black bg-[#ffe17c] shadow-[3px_3px_0_#000]">
          <ArrowUpRight className="h-5 w-5" />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex min-h-7 flex-wrap gap-2">
          {tags.slice(0, 3).map((tag) => (
            <span key={tag} className="border-2 border-black bg-[#ffe17c] px-2 py-1 text-[10px] font-black uppercase tracking-wide">
              {tag}
            </span>
          ))}
        </div>

        <h3 className="neo-heading mt-5 text-2xl leading-tight text-black">{title}</h3>
        <p className="mt-4 line-clamp-3 text-sm font-medium leading-7 text-black/65">{excerpt || '打开这篇笔记，继续阅读完整内容。'}</p>

        <div className="mt-auto flex flex-wrap items-center gap-4 border-t-2 border-black/15 pt-5 text-[11px] font-black uppercase tracking-wide text-black/60">
          <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{date || '未标注'}</span>
          {readTime && readTime !== '-' && <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{readTime}</span>}
        </div>
      </div>
    </motion.article>
  );

  if (!id) return content;
  return <Link to={`/article/${id}`} className="block h-full">{content}</Link>;
}
