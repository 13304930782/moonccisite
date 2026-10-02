// An explicit read allowlist shared by the Worker and the isolated reader.
export function publicRead(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return false;
  for (const header of ['cookie', 'authorization', 'proxy-authorization', 'range', 'upgrade']) {
    if (request.headers.has(header)) return false;
  }
  const url = new URL(request.url);
  if (url.search.length > 1024 || /%|\\|\/\//.test(url.pathname)) return false;
  const path = url.pathname;
  if (/^\/assets\/[A-Za-z0-9_-]+\.(?:js|css|woff2?|png|jpe?g|webp|svg|gif|avif)$/.test(path)) return !url.search;
  if (/^\/(?:|articles|archives|about|links|projects|updates|tags|categories|rss)$/.test(path) || /^\/article\/[1-9]\d*$/.test(path)) return !url.search;
  if (!/^\/api\/posts(?:\/[1-9]\d*(?:\/related|\/neighbors)?|\/meta\/(?:categories|tags)|\/archives)?$/.test(path)) return false;
  const allowed = new Set(['format', 'page', 'pageSize', 'limit', 'search', 'category', 'tag', 'year', 'month']);
  const seen = new Set();
  for (const [key, value] of url.searchParams) {
    if (!allowed.has(key) || seen.has(key) || value.length > 200) return false;
    seen.add(key);
  }
  return true;
}
export function fixedOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) throw new Error('Origin must be a configured HTTPS hostname');
  return url.origin;
}
