import { formatDate } from "./ContentUI";
import { Link } from "react-router-dom";
import { safeImageSrc } from "../lib/safeUrl";
interface BlogCardProps {
  id?: number | string;
  title: string;
  excerpt: string;
  date: string;
  readTime?: string;
  tags: string[];
  image: string;
  index?: number;
  category?: string;
}
export function BlogCard({
  id,
  title,
  excerpt,
  date,
  readTime,
  tags,
  image,
  category,
}: BlogCardProps) {
  const src = safeImageSrc(image);
  const content = (
    <article className="blog-card">
      {src && <img src={src} alt="" loading="lazy" />}
      <small>{category || tags.slice(0, 3).join(" / ")}</small>
      <h3>{title}</h3>
      {excerpt && <p>{excerpt}</p>}
      <div className="inline-actions">
        <small>{formatDate(date)}</small>
        {readTime && readTime !== "-" && <small>{readTime}</small>}
      </div>
    </article>
  );
  return id ? <Link to={`/article/${id}`}>{content}</Link> : content;
}
