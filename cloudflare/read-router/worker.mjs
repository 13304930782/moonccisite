import { publicRead, fixedOrigin } from '../../edge/shared/public-policy.mjs';

function routingReason(request, env) {
  if (env.ROUTING_ENABLED !== 'true') return 'disabled';
  if (!publicRead(request)) return 'not-public-read';
  const country = request.cf?.country;
  if (!country || country === 'XX' || country === 'T1') return 'unknown-region';
  if (country === 'CN') return 'domestic-region';
  if (env.MODE === 'preview') {
    if (!env.PREVIEW_KEY) return 'preview-key-unconfigured';
    return request.headers.get('X-Mooncci-Preview') === env.PREVIEW_KEY ? 'eligible' : 'preview-key-mismatch';
  }
  return env.MODE === 'live' ? 'eligible' : 'invalid-mode';
}
export function overseas(request, env) { return routingReason(request, env) === 'eligible'; }
export async function handle(request, env, fetcher = fetch) {
  // Request headers can never select an upstream or override the CF-provided country.
  const clean = new Headers(request.headers);
  for (const name of ['X-Mooncci-Preview', 'X-Mooncci-Reader-Key', 'X-Mooncci-Public-Host']) clean.delete(name);
  // Diagnostics are opt-in during preview only. Never include keys, URLs or exceptions.
  const diagnostic = env.MODE === 'preview' && request.headers.has('X-Mooncci-Preview');
  const annotate = (response, route, reason) => {
    if (!diagnostic) return response;
    const result = new Response(response.body, response);
    result.headers.set('X-Mooncci-Route', route);
    result.headers.set('X-Mooncci-Reason', reason);
    result.headers.set('X-Mooncci-Router-Version', 'preview-diag-1');
    result.headers.set('Cache-Control', 'private, no-store');
    return result;
  };
  const primary = async reason => annotate(await fetcher(new Request(request, { headers: clean, redirect: 'manual' })), 'primary', reason);
  const reason = routingReason(request, env);
  if (reason !== 'eligible') return primary(reason);
  let origin;
  try {
    origin = fixedOrigin(env.READER_ORIGIN);
    if (new URL(origin).hostname === new URL(request.url).hostname || !env.READER_KEY || env.READER_KEY.length < 32) return primary('reader-config-invalid');
  } catch { return primary('reader-origin-invalid'); }
  const url = new URL(request.url); url.host = new URL(origin).host;
  // Do not transmit arbitrary client headers to the reader.
  const headers = new Headers({ 'X-Mooncci-Reader-Key': env.READER_KEY });
  if (request.headers.get('X-Mooncci-Diagnostic') === '1') headers.set('X-Mooncci-Diagnostic', '1');
  for (const name of ['accept', 'accept-language', 'if-none-match', 'if-modified-since']) {
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  }
  try {
    const response = await fetcher(new Request(url, { method: request.method, headers, redirect: 'manual', signal: AbortSignal.timeout(8000) }), { cf: { cacheTtl: 0, cacheEverything: false } });
    if (response.status >= 500 || response.status === 401 || response.status === 403 || (response.status === 404 && url.pathname.startsWith('/assets/')) || response.headers.has('set-cookie')) {
      await response.body?.cancel(); return primary(response.headers.has('set-cookie') ? 'reader-private-response' : 'reader-http-' + response.status);
    }
    // Do not let internal origin redirects escape into the browser.
    if (response.status >= 300 && response.status < 400 && response.status !== 304) {
      await response.body?.cancel(); return primary('reader-redirect');
    }
    return annotate(response, 'reader', 'reader-response');
  } catch { return primary('reader-fetch-error'); }
}
export default { fetch: (request, env) => handle(request, env) };
