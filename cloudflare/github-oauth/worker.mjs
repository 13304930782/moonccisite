const routes = {
  '/token': { method: 'POST', url: 'https://github.com/login/oauth/access_token' },
  '/user': { method: 'GET', url: 'https://api.github.com/user' },
  '/emails': { method: 'GET', url: 'https://api.github.com/user/emails' },
};
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' };
const failure = status => new Response('{"error":"proxy_request_failed"}', { status, headers });
async function bounded(body, max) {
  if (!body) return new Uint8Array();
  const reader = body.getReader(); const chunks = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.length;
      if (total > max) { await reader.cancel(); throw new Error('size'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
export default {
  async fetch(request, env) {
    // No request/body logging, persistence, cache API or arbitrary upstream URLs.
    const expected = env.GITHUB_OAUTH_PROXY_KEY || '';
    const supplied = request.headers.get('X-Mooncci-Proxy-Key') || '';
    if (!/^[a-f0-9]{64}$/.test(expected) || supplied.length !== 64) return failure(403);
    let diff = 0; for (let i = 0; i < 64; i++) diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
    if (diff) return failure(403);
    const url = new URL(request.url);
    const route = Object.hasOwn(routes, url.pathname) ? routes[url.pathname] : null;
    if (!route || url.search) return failure(404);
    if (request.method !== route.method) return failure(405);
    const upstreamHeaders = { Accept: 'application/json', 'User-Agent': 'mooncci-login' };
    let body;
    try {
      if (route.method === 'POST') {
        if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) return failure(415);
        body = await bounded(request.body, 16384);
        upstreamHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
      } else {
        const auth = request.headers.get('Authorization') || '';
        if (!/^Bearer [A-Za-z0-9_\-.]{1,8192}$/.test(auth)) return failure(400);
        upstreamHeaders.Authorization = auth;
      }
      const response = await fetch(route.url, { method: route.method, headers: upstreamHeaders, body, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000) });
      const data = await bounded(response.body, 256 * 1024);
      if (response.status < 200 || response.status >= 300) return failure(response.status >= 400 ? response.status : 502);
      return new Response(data, { status: 200, headers });
    } catch { return failure(502); }
  },
};
