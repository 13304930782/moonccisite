// An explicit read allowlist shared by the Worker and the isolated reader.
const segment = value => {
  try {
    const decoded=decodeURIComponent(value);
    return decoded.length>0 && decoded.length<=255 && !/[/\\#?%\x00-\x1f\x7f]/.test(decoded) && !['.','..'].includes(decoded) && encodeURIComponent(decoded)===value;
  } catch { return false; }
};
export function publicRead(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return false;
  for (const header of ['cookie', 'authorization', 'proxy-authorization', 'range', 'upgrade']) {
    if (request.headers.has(header)) return false;
  }
  const url = new URL(request.url);
  if (url.search.length > 1024 || /\\|\/\//.test(url.pathname)) return false;
  const path = url.pathname;
  if (/^\/assets\/[A-Za-z0-9_-]+\.(?:js|css|woff2?|png|jpe?g|webp|svg|gif|avif)$/.test(path)) return !url.search;
  if(/^\/assets\/(?:en|zh)-[A-Za-z0-9_-]+\.json$/.test(path))return !url.search;
  const page=path.replace(/^\/en(?=\/|$)/,'')||'/';
  const detail=page.match(/^\/(article|updates|projects|category|tag|series)\/([^/]+)$/);
  const publicPage=/^\/(?:|articles|archives|about|links|projects|updates|tags|categories|rss|series|early-access|mail-setup)$/.test(page) || !!(detail && segment(detail[2]) && (detail[1]!=='updates'||/^[1-9]\d*$/.test(detail[2])));
  const post=path.match(/^\/api\/posts\/([^/]+)(?:\/(related|neighbors|discovery))?$/);
  const publicApi=/^\/api\/posts(?:\/meta\/(?:categories|tags)|\/archives)?$/.test(path) || !!(post && segment(post[1]) && !['meta','drafts'].includes(post[1]));
  if (!publicPage && !publicApi) return false;
  const allowed = new Set(publicPage?['page','type','release']:['format','page','pageSize','limit','search','category','tag','year','month','locale']);
  const seen = new Set();
  for (const [key, value] of url.searchParams) {
    if (!allowed.has(key) || seen.has(key) || value.length > 200) return false;
    if(key==='locale'&&!['zh-CN','en'].includes(value))return false;
    if(['page','pageSize','limit','year','month'].includes(key)&&!/^\d{1,6}$/.test(value))return false;
    if(key==='type'&&!['post','update','release'].includes(value))return false;
    seen.add(key);
  }
  return true;
}
export function fixedOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) throw new Error('Origin must be a configured HTTPS hostname');
  return url.origin;
}
