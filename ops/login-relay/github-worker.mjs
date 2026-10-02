const routes = {
  '/token': { method: 'POST', url: 'https://github.com/login/oauth/access_token' },
  '/user': { method: 'GET', url: 'https://api.github.com/user' },
  '/emails': { method: 'GET', url: 'https://api.github.com/user/emails' },
};
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' };
const failure = (status, diagnostic = 'request_rejected') => new Response('{"error":"proxy_request_failed"}', {
  status, headers: { ...headers, 'X-Mooncci-Proxy-Diagnostic': diagnostic, 'X-Mooncci-Proxy-Version': '3' },
});
function exceptionKind(error) {
  // Only fixed labels leave the Worker; never return raw exception text.
  if (error?.message === 'size') return 'size_limit';
  if (['AbortError', 'TimeoutError'].includes(error?.name)) return 'timeout';
  const message = String(error?.message || '');
  if (/cache.*(not implemented|unsupported)|unsupported cache/i.test(message)) return 'cache_unsupported';
  if (/AbortSignal.*timeout.*not a function/i.test(message)) return 'signal_unsupported';
  if (/redirect/i.test(message)) return 'redirect_error';
  if (error?.name === 'TypeError') return 'type_error';
  return 'exception';
}
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
    let stage = 'request_body';
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
      stage = 'upstream_fetch';
      const response = await fetch(route.url, { method: route.method, headers: upstreamHeaders, body, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (response.status >= 300 && response.status < 400) {
        let target = 'missing_location';
        try {
          const location = response.headers.get('location');
          if (location) {
            const destination = new URL(location, route.url);
            target = destination.href === route.url ? 'same_endpoint' : destination.origin === 'https://api.github.com' ? 'github_api' : destination.origin === 'https://github.com' ? 'github_web' : 'other_origin';
          }
        } catch { target = 'invalid_location'; }
        await response.body?.cancel();
        return failure(502, `upstream_redirect_${response.status}_${target}`);
      }
      stage = 'upstream_body';
      const data = await bounded(response.body, 256 * 1024);
      if (response.status < 200 || response.status >= 300) return failure(response.status >= 400 ? response.status : 502, `upstream_http_${response.status}`);
      return new Response(data, { status: 200, headers: { ...headers, 'X-Mooncci-Proxy-Diagnostic': 'upstream_ok', 'X-Mooncci-Proxy-Version': '3' } });
    } catch (error) { return failure(502, `${stage}_${exceptionKind(error)}`); }
  },
};
