import {useI18n} from '../i18n';
import { articlePath } from '../lib/articleUrl';
import { formatDate } from "./ContentUI";

import {Link} from './LocaleLink';
import { safeImageSrc } from "../lib/safeUrl";
import { CardCoverImage } from './CardCoverImage';
import { type CoverCrop } from '../lib/coverCrop';
import '../../styles/article-label.css';
interface BlogCardProps {
  id?: number | string;
  slug?: string | null;
  title: string;
  excerpt: string;
  date: string;
  dateLabel?: string;
  readTime?: string;
  tags: string[];
  image: string;
  coverCrop?: CoverCrop;
  index?: number;
  category?: string;
  contentLocale?: 'zh-CN' | 'en';
}
export function BlogCard({
  id,
  slug,
  title,
  excerpt,
  date,
  dateLabel,
  readTime,
  tags,
  image,
  category,
  contentLocale = 'zh-CN',
}: BlogCardProps) {
  const {t, locale, formatDate} = useI18n();
  const src = safeImageSrc(image);
  const content = (
    <article className="blog-card">
      {src && <CardCoverImage src={src} responsive alt="" loading="lazy" decoding="async" />}
      <small>{category || tags.slice(0, 3).join(" / ")}</small>
      <h3 lang={contentLocale}>{title}</h3>
      {locale === 'en' && contentLocale !== 'en' && <small className="content-language-note">{t("m_11b08839af")}</small>}
      {excerpt && <p lang={contentLocale}>{excerpt}</p>}
      <div className="inline-actions">
        <small>{dateLabel && `${dateLabel} `}{formatDate(date)}</small>
        {readTime && readTime !== "-" && <small>{readTime}</small>}
      </div>
    </article>
  );
  return id ? <Link to={articlePath({id,slug}, contentLocale)}>{content}</Link> : content;
}
