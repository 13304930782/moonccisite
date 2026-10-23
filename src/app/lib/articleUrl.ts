export function articlePath(article: { id: number | string; slug?: string | null }): string {
  const slug = typeof article.slug === 'string' ? article.slug.trim() : '';
  return `/article/${encodeURIComponent(slug || String(article.id))}`;
}
