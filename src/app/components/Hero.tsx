import { motion } from 'motion/react';
import { ArrowRight, BookOpen, Braces, Sparkles, Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { initialSiteSettings } from '../config/initialSiteSettings';
import { isExternalHttpUrl, safeHref, safeRoutePath } from '../lib/safeUrl';

const defaultHero = {
  badge: '持续更新 · 工程师的独立知识库',
  title_before: '把复杂技术，',
  title_highlight: '写明白',
  title_after: '。',
  subtitle: '记录前端、后端、算法与系统设计，也分享那些真正改变开发方式的经验和思考。',
  primary_text: '开始阅读',
  primary_link: '/articles',
  secondary_text: '浏览分类',
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
  const className = `neo-button ${primary ? 'neo-button-dark' : ''}`;
  const externalHref = isExternalHttpUrl(to) ? safeHref(to, '') : '';

  if (externalHref) {
    return <a href={externalHref} target="_blank" rel="noreferrer" className={className}>{children}</a>;
  }

  return <Link to={safeRoutePath(to)} className={className}>{children}</Link>;
}

function BrowserMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40, rotate: 1.5 }}
      animate={{ opacity: 1, x: 0, rotate: -1.5 }}
      transition={{ delay: 0.18, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      className="neo-card-lg overflow-hidden rounded-[14px] bg-white"
    >
      <div className="flex items-center justify-between border-b-2 border-black bg-[#171e19] px-4 py-3">
        <div className="flex gap-2" aria-hidden="true">
          <span className="h-3 w-3 rounded-full border border-black bg-[#ffe17c]" />
          <span className="h-3 w-3 rounded-full border border-black bg-[#b7c6c2]" />
          <span className="h-3 w-3 rounded-full border border-white bg-white" />
        </div>
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">mooncci.dev / notes</span>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-[1.3fr_0.7fr] sm:p-5">
        <div className="border-2 border-black bg-[#b7c6c2] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex h-10 w-10 items-center justify-center border-2 border-black bg-[#ffe17c]">
              <Braces className="h-5 w-5" />
            </div>
            <span className="border-2 border-black bg-white px-2 py-1 text-[10px] font-black uppercase">Latest note</span>
          </div>
          <h3 className="neo-heading mt-8 text-3xl text-black">BUILD.<br />BREAK.<br />LEARN.</h3>
          <div className="mt-6 space-y-2">
            <div className="h-2 w-full bg-[#171e19]" />
            <div className="h-2 w-4/5 bg-[#171e19]" />
            <div className="h-2 w-2/3 bg-[#171e19]" />
          </div>
        </div>

        <div className="grid gap-3">
          <div className="border-2 border-black bg-[#ffe17c] p-4">
            <span className="text-xs font-black uppercase tracking-wider">Topics</span>
            <div className="mt-5 text-4xl font-black">04</div>
            <p className="mt-1 text-xs font-bold">持续生长的知识地图</p>
          </div>
          <div className="border-2 border-black bg-[#171e19] p-4 text-white">
            <Terminal className="h-5 w-5 text-[#ffe17c]" />
            <p className="mt-5 font-mono text-xs leading-6 text-white/75">
              $ curiosity --daily<br />
              <span className="text-[#b7c6c2]">ready to explore_</span>
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 border-t-2 border-black text-center text-[10px] font-black uppercase tracking-wider">
        {['Frontend', 'Backend', 'Systems'].map((item, index) => (
          <div key={item} className={`py-3 ${index < 2 ? 'border-r-2 border-black' : ''}`}>{item}</div>
        ))}
      </div>
    </motion.div>
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
    <section className="neo-dot-grid border-b-2 border-black px-5 pb-20 pt-32 lg:px-6 lg:pb-24 lg:pt-40">
      <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          {hero.badge && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="neo-kicker"
            >
              <Sparkles className="h-4 w-4" />
              {hero.badge}
            </motion.div>
          )}

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.5 }}
            className="neo-heading neo-hero-title mt-8 max-w-3xl text-black"
          >
            {hero.title_before}
            <span className="neo-outline-text inline-block">{hero.title_highlight}</span>
            {hero.title_after}
          </motion.h1>

          {hero.subtitle && (
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.5 }}
              className="mt-7 max-w-2xl text-base font-bold leading-8 text-black/75 md:text-lg"
            >
              {hero.subtitle}
            </motion.p>
          )}

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18, duration: 0.5 }}
            className="mt-9 flex flex-wrap gap-4"
          >
            {hero.primary_text && (
              <SmartButton to={hero.primary_link || '/articles'} primary>
                <BookOpen className="h-4 w-4" />
                {hero.primary_text}
                <ArrowRight className="h-4 w-4" />
              </SmartButton>
            )}
            {hero.secondary_text && <SmartButton to={hero.secondary_link || '/categories'}>{hero.secondary_text}</SmartButton>}
          </motion.div>
        </div>

        <BrowserMockup />
      </div>
    </section>
  );
}
