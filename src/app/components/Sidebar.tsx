import { motion } from 'motion/react';
import { ArrowUpRight, BookOpen, Github, Mail, Tag, Twitter, User } from 'lucide-react';
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
    api('/settings/site').then((data) => setProfile({ ...defaultProfile, ...(data.profile || {}) })).catch(() => {});
    api('/posts/meta/categories').then((data) => setCategories(Array.isArray(data) ? data : [])).catch(() => setCategories([]));
    api('/posts/meta/tags').then((data) => setTags(Array.isArray(data) ? data : [])).catch(() => setTags([]));
  }, []);

  const socials = [
    { href: githubUrl, label: 'GitHub', icon: Github, external: true },
    { href: twitterUrl, label: 'Twitter', icon: Twitter, external: true },
    { href: emailUrl, label: 'Email', icon: Mail, external: false },
  ].filter((item) => item.href);

  return (
    <div className="space-y-6">
      <motion.section
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        className="rounded-[12px] border-2 border-black bg-[#b7c6c2] p-6 shadow-[6px_6px_0_#000]"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden border-2 border-black bg-white shadow-[4px_4px_0_#000]">
            {avatarUrl ? <img src={avatarUrl} alt={profile.name} className="h-full w-full object-cover" /> : <User className="h-8 w-8" />}
          </div>
          <span className="border-2 border-black bg-[#ffe17c] px-2 py-1 text-[10px] font-black uppercase">About me</span>
        </div>

        <h3 className="neo-heading mt-7 text-3xl text-black">{profile.name}</h3>
        <p className="mt-2 text-xs font-black uppercase tracking-wider text-black/60">{profile.title}</p>
        <p className="mt-5 text-sm font-bold leading-7 text-black/75">{profile.bio}</p>

        {socials.length > 0 && (
          <div className="mt-6 flex gap-2 border-t-2 border-black pt-5">
            {socials.map(({ href, label, icon: Icon, external }) => (
              <a
                key={label}
                href={href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noreferrer' : undefined}
                aria-label={label}
                className="flex h-10 w-10 items-center justify-center border-2 border-black bg-white shadow-[3px_3px_0_#000] transition hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-none"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        )}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-[12px] border-2 border-black bg-white p-5 shadow-[6px_6px_0_#000]"
      >
        <div className="flex items-center gap-3 border-b-2 border-black pb-4">
          <span className="flex h-10 w-10 items-center justify-center border-2 border-black bg-[#b7c6c2]"><BookOpen className="h-5 w-5" /></span>
          <h3 className="neo-heading text-xl">热门分类</h3>
        </div>

        <div className="mt-3 divide-y-2 divide-black/15">
          {categories.length === 0 && <p className="py-4 text-sm font-bold text-black/50">暂无分类</p>}
          {categories.slice(0, 7).map((item) => (
            <Link
              key={item.category}
              to={`/category/${encodeURIComponent(item.category)}`}
              className="group flex items-center justify-between py-3 text-sm font-black"
            >
              <span className="group-hover:underline">{item.category}</span>
              <span className="flex items-center gap-2 text-xs text-black/50">{item.count}<ArrowUpRight className="h-3.5 w-3.5" /></span>
            </Link>
          ))}
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.16 }}
        className="rounded-[12px] border-2 border-black bg-[#ffe17c] p-5 shadow-[6px_6px_0_#000]"
      >
        <div className="flex items-center gap-3">
          <Tag className="h-5 w-5" />
          <h3 className="neo-heading text-xl">标签索引</h3>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {tags.length === 0 && <p className="text-sm font-bold text-black/50">暂无标签</p>}
          {tags.slice(0, 12).map((item) => (
            <Link
              key={item.tag}
              to={`/tag/${encodeURIComponent(item.tag)}`}
              className="border-2 border-black bg-white px-2.5 py-1.5 text-[11px] font-black shadow-[2px_2px_0_#000] transition hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none"
            >
              #{item.tag}
            </Link>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
