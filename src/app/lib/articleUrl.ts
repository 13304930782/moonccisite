import {localizedPath, type Locale} from './locale';
export function articlePath(article: { id: number | string; slug?: string | null; content_locale?: Locale }, locale: Locale = article.content_locale || 'zh-CN'): string {
  const slug = typeof article.slug === 'string' ? article.slug.trim() : '';
  return localizedPath(`/article/${encodeURIComponent(slug || String(article.id))}`,locale);
}
