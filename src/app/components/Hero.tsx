import { motion } from 'motion/react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { initialSiteSettings } from '../config/initialSiteSettings';
import { isExternalHttpUrl, safeHref, safeRoutePath } from '../lib/safeUrl';

const defaultHero = {
  badge: '欢迎来到我的技术博客',
  title_before: '探索',
  title_highlight: '编程',
  title_after: '之美',
  subtitle: '分享前端、后端、算法、系统设计等计算机领域的知识与经验',
  primary_text: '开始阅读',
  primary_link: '/articles',
  secondary_text: '了解更多',
  secondary_link: '/categories',
};

function SmartButton({
  to,
  children,
  primary = false,
}: {
  to: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  const className = primary
    ? 'inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-7 py-3 text-white font-medium shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 transition-all'
    : 'inline-flex items-center gap-2 rounded-full bg-white/70 dark:bg-gray-900/70 px-7 py-3 text-gray-700 dark:text-gray-200 font-medium border border-gray-200/60 dark:border-gray-800 hover:bg-white dark:hover:bg-gray-900 transition-all';

  const externalHref = isExternalHttpUrl(to) ? safeHref(to, '') : '';

  if (externalHref) {
    return (
      <a href={externalHref} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link to={safeRoutePath(to)} className={className}>
      {children}
    </Link>
  );
}

export function Hero() {
  const [hero, setHero] = useState({ ...defaultHero, ...(initialSiteSettings.hero || {}) });

  useEffect(() => {
    api('/settings/site')
      .then((data) => setHero({ ...defaultHero, ...(data.hero || {}) }))
      .catch(() => {});
  }, []);

  return (
    <section className="relative overflow-hidden px-6 pt-36 pb-20">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-20 h-72 w-72 -translate-x-1/2 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute right-10 top-40 h-72 w-72 rounded-full bg-purple-500/20 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-5xl text-center">
        {hero.badge && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="inline-flex items-center gap-2 rounded-full bg-white/70 dark:bg-gray-900/70 px-4 py-2 text-sm text-gray-600 dark:text-gray-300 border border-gray-200/60 dark:border-gray-800 backdrop-blur"
          >
            <Sparkles className="h-4 w-4 text-purple-600" />
            {hero.badge}
          </motion.div>
        )}

        <motion.h1
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="mt-8 text-5xl md:text-7xl font-bold tracking-tight text-gray-900 dark:text-white"
        >
          {hero.title_before}
          <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">
            {hero.title_highlight}
          </span>
          {hero.title_after}
        </motion.h1>

        {hero.subtitle && (
          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mt-7 max-w-3xl text-lg leading-8 text-gray-600 dark:text-gray-300"
          >
            {hero.subtitle}
          </motion.p>
        )}

        <motion.div
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          {hero.primary_text && (
            <SmartButton to={hero.primary_link || '/articles'} primary>
              {hero.primary_text}
              <ArrowRight className="h-4 w-4" />
            </SmartButton>
          )}

          {hero.secondary_text && (
            <SmartButton to={hero.secondary_link || '/categories'}>
              {hero.secondary_text}
            </SmartButton>
          )}
        </motion.div>
      </div>
    </section>
  );
}
