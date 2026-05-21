import { motion } from 'motion/react';
import { Calendar, Clock } from 'lucide-react';
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
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.6,
        delay: index * 0.1,
        ease: [0.16, 1, 0.3, 1]
      }}
      whileHover={{ y: -8, transition: { duration: 0.3 } }}
      className="group cursor-pointer h-full"
    >
      <div className="h-full rounded-3xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden shadow-lg shadow-black/5 hover:shadow-xl hover:shadow-black/10 transition-all duration-300">
        <div className="relative h-56 overflow-hidden bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-800 dark:to-gray-900">
          {imageSrc ? (
            <motion.img
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.6 }}
              src={imageSrc}
              alt={title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-pink-500/20" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
        </div>

        <div className="p-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-medium border border-blue-100 dark:border-blue-800/50"
              >
                {tag}
              </span>
            ))}
          </div>

          <h3 className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {title}
          </h3>

          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 leading-relaxed">
            {excerpt}
          </p>

          <div className="flex items-center gap-4 pt-2 text-xs text-gray-500 dark:text-gray-500">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>{date}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>{readTime}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.article>
  );

  if (!id) return content;

  return (
    <Link to={`/article/${id}`} className="block h-full">
      {content}
    </Link>
  );
}
