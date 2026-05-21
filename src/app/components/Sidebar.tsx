import { motion } from 'motion/react';
import { BookOpen, Github, Mail, Tag, Twitter, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { safeHref, safeImageSrc, safeMailto } from '../lib/safeUrl';

const defaultProfile = {
  name: 'mooncci',
  title: '计算机博客站长',
  bio: '记录技术、生活与思考。',
  avatar_url: '',
  github_url: '',
  twitter_url: '',
  email: '',
};

export function Sidebar() {
  const [profile, setProfile] = useState(defaultProfile);
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const avatarUrl = safeImageSrc(profile.avatar_url);
  const githubUrl = safeHref(profile.github_url, '');
  const twitterUrl = safeHref(profile.twitter_url, '');
  const emailUrl = safeMailto(profile.email);

  useEffect(() => {
    api('/settings/site')
      .then((data) => setProfile({ ...defaultProfile, ...(data.profile || {}) }))
      .catch(() => {});

    api('/posts/meta/categories')
      .then(setCategories)
      .catch(() => setCategories([]));

    api('/posts/meta/tags')
      .then(setTags)
      .catch(() => setTags([]));
  }, []);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-3xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 p-8 shadow-lg shadow-black/5 text-center"
      >
        <div className="relative inline-block">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 p-1">
            <div className="w-full h-full rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={profile.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-10 h-10 text-gray-400" />
              )}
            </div>
          </div>
          <div className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-green-500 border-4 border-white dark:border-gray-900" />
        </div>

        <h3 className="mt-5 text-xl font-semibold text-gray-900 dark:text-white">
          {profile.name}
        </h3>

        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {profile.title}
        </p>

        <p className="mt-4 text-sm text-gray-600 dark:text-gray-300 leading-7">
          {profile.bio}
        </p>

        <div className="mt-6 flex justify-center gap-3">
          {githubUrl && (
            <a
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-blue-600 transition-colors"
            >
              <Github className="w-4 h-4" />
            </a>
          )}

          {twitterUrl && (
            <a
              href={twitterUrl}
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-blue-600 transition-colors"
            >
              <Twitter className="w-4 h-4" />
            </a>
          )}

          {emailUrl && (
            <a
              href={emailUrl}
              className="p-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-blue-600 transition-colors"
            >
              <Mail className="w-4 h-4" />
            </a>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-3xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 p-6 shadow-lg shadow-black/5"
      >
        <div className="flex items-center gap-2 mb-5">
          <BookOpen className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            分类
          </h3>
        </div>

        <div className="space-y-3">
          {categories.length === 0 && (
            <p className="text-sm text-gray-500">暂无分类</p>
          )}

          {categories.slice(0, 8).map((item) => (
            <Link
              key={item.category}
              to={`/category/${encodeURIComponent(item.category)}`}
              className="flex items-center justify-between rounded-2xl px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <span>{item.category}</span>
              <span className="text-xs text-gray-400">{item.count}</span>
            </Link>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-3xl bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 p-6 shadow-lg shadow-black/5"
      >
        <div className="flex items-center gap-2 mb-5">
          <Tag className="w-5 h-5 text-purple-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            热门标签
          </h3>
        </div>

        <div className="flex flex-wrap gap-2">
          {tags.length === 0 && (
            <p className="text-sm text-gray-500">暂无标签</p>
          )}

          {tags.slice(0, 12).map((item) => (
            <Link
              key={item.tag}
              to={`/tag/${encodeURIComponent(item.tag)}`}
              className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs text-gray-600 dark:text-gray-300 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30 transition-colors"
            >
              {item.tag}
            </Link>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
