import { publicRead, fixedOrigin } from '../../edge/shared/public-policy.mjs';

export function overseas(request, env) {
  if (env.ROUTING_ENABLED !== 'true' || !publicRead(request)) return false;
  const country = request.cf?.country;
  if (!country || country === 'CN' || country === 'XX' || country === 'T1') return false;
  if (env.MODE === 'preview') return Boolean(env.PREVIEW_KEY) && request.headers.get('X-Mooncci-Preview') === env.PREVIEW_KEY;
  return env.MODE === 'live';
}
export async function handle(request, env, fetcher = fetch) {
  // Request headers can never select an upstream or override the CF-provided country.
  const clean = new Headers(request.headers);
  for (const name of ['X-Mooncci-Preview', 'X-Mooncci-Reader-Key', 'X-Mooncci-Public-Host']) clean.delete(name);
  const primary = () => fetcher(new Request(request, { headers: clean, redirect: 'manual' }));
  if (!overseas(request, env)) return primary();
  let origin;
  try {
    origin = fixedOrigin(env.READER_ORIGIN);
    if (new URL(origin).hostname === new URL(request.url).hostname || !env.READER_KEY || env.READER_KEY.length < 32) return primary();
  } catch { return primary(); }
  const url = new URL(request.url); url.host = new URL(origin).host;
  // Do not transmit arbitrary client headers to the reader.
  const headers = new Headers({ 'X-Mooncci-Reader-Key': env.READER_KEY });
  for (const name of ['accept', 'accept-language', 'if-none-match', 'if-modified-since']) {
    if (request.headers.has(name)) headers.set(name, request.headers.get(name));
  }
  try {
    const response = await fetcher(new Request(url, { method: request.method, headers, redirect: 'manual', signal: AbortSignal.timeout(8000) }), { cf: { cacheTtl: 0, cacheEverything: false } });
    if (response.status >= 500 || response.status === 401 || response.status === 403 || (response.status === 404 && url.pathname.startsWith('/assets/')) || response.headers.has('set-cookie')) {
      await response.body?.cancel(); return primary();
    }
    // Do not let internal origin redirects escape into the browser.
    if (response.status >= 300 && response.status < 400 && response.status !== 304) {
      await response.body?.cancel(); return primary();
    }
    return response;
  } catch { return primary(); }
}
export default { fetch: (request, env) => handle(request, env) };
