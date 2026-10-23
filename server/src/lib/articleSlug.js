const fail = (message, status = 400) => Object.assign(new Error(message), {status});
function isValidArticleSlug(value) {
  return typeof value === 'string' && value.length <= 100 && !['archives', 'meta'].includes(value) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && /[a-z]/.test(value);
}
function validateArticleSlug(value, previous = '') {
  const slug = typeof value === 'string' ? value.trim() : '';
  if (!slug) throw fail('发布前请填写英文链接，或使用 DeepSeek 生成。');
  if (isValidArticleSlug(slug) || slug && slug === previous && slug.length <= 255 && !/[\\/?#\u0000-\u001f\u007f]/.test(slug)) return slug;
  throw fail('请填写不超过 100 个字符的英文链接，使用小写字母、数字和连字符，并至少包含一个英文字母。');
}
function articlePath(post) {
  const slug = typeof post.slug === 'string' ? post.slug.trim() : '';
  return '/article/' + (slug ? encodeURIComponent(slug) : post.id);
}
function articleReference(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 255 && !/[\\/?#\u0000-\u001f\u007f]/.test(value) ? value : null;
}
function decodeArticleReference(value) {
  try { return articleReference(decodeURIComponent(value)); } catch { return null; }
}
async function resolveArticle(db, reference, {published = false} = {}) {
  if (!articleReference(reference)) return null;
  const numeric = /^[1-9]\d*$/.test(reference);
  if (numeric && (!Number.isSafeInteger(Number(reference)) || Number(reference) > 2147483647)) return null;
  const where = numeric ? 'p.id=?' : '(p.slug=? OR p.id=(SELECT post_id FROM article_slug_aliases WHERE slug=? LIMIT 1))';
  const args = numeric ? [reference] : [reference, reference];
  const [[post]] = await db.query(
    'SELECT p.*,u.username AS author_name, COALESCE(p.published_at,p.created_at) AS date, ' +
    '(SELECT deleted_at FROM account_profiles ap WHERE ap.user_id=u.id) AS author_deleted, ' +
    '(SELECT avatar_url FROM account_profiles ap WHERE ap.user_id=u.id) AS author_avatar ' +
    'FROM posts p JOIN users u ON u.id=p.author_id WHERE ' + where + (published ? " AND p.status='published'" : '') + ' LIMIT 1', args);
  return post || null;
}
async function claimArticleSlug(connection, postId, slug, previous = '') {
  for (const value of new Set([previous, slug].filter(Boolean))) {
    await connection.query('INSERT INTO article_slug_aliases(slug,post_id) VALUES (?,?) ON DUPLICATE KEY UPDATE slug=slug', [value, postId]);
    const [[alias]] = await connection.query('SELECT post_id FROM article_slug_aliases WHERE slug=? FOR UPDATE', [value]);
    if (!alias || Number(alias.post_id) !== Number(postId)) throw fail('这个文章链接已经使用过，请换一个英文链接。', 422);
  }
}
function articleSlugWriteError(error) {
  return error.code === 'ER_DUP_ENTRY' && /for key ['`](?:posts\.)?slug['`]$/i.test(error.sqlMessage || error.message || '')
    ? fail('这个文章链接已经使用过，请换一个英文链接。', 422) : error;
}
module.exports = {articleSlugWriteError, isValidArticleSlug, validateArticleSlug, articlePath, articleReference, decodeArticleReference, resolveArticle, claimArticleSlug};
