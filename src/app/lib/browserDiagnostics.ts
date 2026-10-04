// Opt-in, tab-local measurements. No payloads, query strings or identity.
const KEY = 'mooncci.diagnostics.v1';
const TTL = 20 * 60 * 1000;
const MAX_ROWS = 500;
type Row = Record<string, string | number | boolean | null>;
type Session = { version: 1; started: number; expires: number; active: boolean; mode: 'relay-on' | 'relay-off' | 'unknown'; rows: Row[] };
let session: Session | null = null;
const listeners = new Set<() => void>();
let observer: PerformanceObserver | undefined;
let expiry: ReturnType<typeof setTimeout> | undefined;
const round = (v: number) => Number.isFinite(v) ? Math.max(0, Math.round(v * 10) / 10) : 0;

export function diagnosticPath(value: string): string | null {
  const pathname = value.split(/[?#]/, 1)[0];
  if (/^\/(?:|articles|projects|updates|account\/mailbox|admin\/mailbox|diagnostics)$/.test(pathname)) return pathname;
  if (/^\/article\/(?:\d+|:id)$/.test(pathname)) return '/article/:id';
  if (/^\/projects\/(?:[\w-]+|:slug)$/.test(pathname)) return '/projects/:slug';
  if (/^\/assets\/[^/]+$/.test(pathname)) return '/assets/:asset';
  if (/^\/api\/(?:now|activity|projects|posts|updates|site-settings|settings\/public|auth\/me|seo)$/.test(pathname)) return pathname;
  if (/^\/api\/posts\/(?:\d+|:id)$/.test(pathname)) return '/api/posts/:id';
  if (/^\/api\/projects\/(?:[\w-]+|:slug)$/.test(pathname)) return '/api/projects/:slug';
  if (/^\/api\/mailboxes\/(?:me|sent|send|folders\/(?:inbox|sent))$/.test(pathname)) return pathname;
  if (/^\/api\/mailboxes\/folders\/(?:inbox|sent)\/(?:\d+|:uid)$/.test(pathname)) return pathname.replace(/\/(?:\d+|:uid)$/, '/:uid');
  return null;
}
function persist() {
  try { if (session) sessionStorage.setItem(KEY, JSON.stringify(session)); else sessionStorage.removeItem(KEY); } catch { /* Optional storage. */ }
  listeners.forEach(fn => { try { fn(); } catch { /* Telemetry must fail open. */ } });
}
export function diagnosticState() { return session; }
export function subscribeDiagnostics(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function diagnosticsActive() {
  if (session?.active && Date.now() >= session.expires) stopDiagnostics();
  return !!session?.active;
}
function add(row: Row) {
  if (!diagnosticsActive() || !session) return;
  session.rows.push(row); if (session.rows.length > MAX_ROWS) session.rows.shift(); persist();
}
function install() {
  clearTimeout(expiry);
  expiry = setTimeout(stopDiagnostics, Math.max(0, (session?.expires || 0) - Date.now()));
  observer?.disconnect();
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const item = entry as PerformanceResourceTiming;
        let url: URL; try { url = new URL(item.name); } catch { continue; }
        if (url.origin !== location.origin || performance.timeOrigin + item.startTime < (session?.started || 0)) continue;
        const path = diagnosticPath(url.pathname); if (!path) continue;
        add({ type: item.entryType, path, at: Math.round(performance.timeOrigin + item.startTime), duration_ms: round(item.duration),
          dns_ms: round(item.domainLookupEnd - item.domainLookupStart), connect_ms: round(item.connectEnd - item.connectStart),
          tls_ms: item.secureConnectionStart > 0 ? round(item.connectEnd - item.secureConnectionStart) : 0,
          ttfb_ms: round(item.responseStart - item.startTime), download_ms: round(item.responseEnd - item.responseStart),
          transfer_bytes: round(item.transferSize), protocol: /^(h2|h3|http\/1\.1)$/.test(item.nextHopProtocol) ? item.nextHopProtocol : 'unknown' });
      }
    });
    observer.observe({ entryTypes: ['resource', 'navigation'] });
    for (const entry of performance.getEntriesByType('navigation')) {
      const n = entry as PerformanceNavigationTiming, path = diagnosticPath(location.pathname);
      if (path && performance.timeOrigin >= (session?.started || 0)) add({ type: 'navigation', path, at: Math.round(performance.timeOrigin), ttfb_ms: round(n.responseStart), duration_ms: round(n.duration) });
    }
  } catch { /* Measurements must never interrupt application requests. */ }
}
export function startDiagnostics(mode: Session['mode']) {
  session = { version: 1, started: Date.now(), expires: Date.now() + TTL, active: true, mode, rows: [] };
  persist(); install();
}
export function stopDiagnostics() { if (session) session.active = false; observer?.disconnect(); clearTimeout(expiry); persist(); }
export function clearDiagnostics() { stopDiagnostics(); session = null; persist(); }
export function visibleDiagnostic(path: string, stage: 'route' | 'content-ready' | 'mail-ready') {
  const safe = diagnosticPath(path); if (safe) add({ type: stage, path: safe, at: Date.now() });
}
export function beginApiDiagnostic(path: string) {
  const safe = diagnosticPath('/api' + path);
  if (!safe || !diagnosticsActive()) return null;
  const current = session, began = performance.now(), at = Date.now();
  let status = 0, requestId = '', ingress = 'UNKNOWN', apiMs: number | null = null;
  return {
    response(response: Response) {
      status = response.status;
      const id = response.headers.get('X-Mail-Request-ID') || response.headers.get('X-Diagnostic-Request-ID') || '';
      requestId = /^[a-f0-9-]{36}$/i.test(id) ? id : '';
      const rawIngress = response.headers.get('X-Diagnostic-Ingress');
      if (rawIngress === 'CN_DIRECT' || rawIngress === 'US_PROXY') ingress = rawIngress;
      const duration = response.headers.get('Server-Timing')?.match(/(?:^|,)\s*app;dur=([\d.]+)/)?.[1];
      if (duration && Number.isFinite(Number(duration))) apiMs = round(Number(duration));
    },
    finish() {
      if (session !== current) return;
      add({ type: 'api', path: safe, at, duration_ms: round(performance.now() - began), status, request_id: requestId, ingress, api_ms: apiMs });
    },
  };
}
export function exportDiagnostics() {
  return JSON.stringify({ ...session, build: import.meta.env.VITE_BUILD_REVISION || 'unknown',
    note: 'Device timings; relay mode is user-selected. Missing timing is not zero server latency. No payloads or complete URLs are collected.' }, null, 2);
}
try {
  const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
  if (saved?.version === 1 && saved.expires > Date.now() && saved.expires <= Date.now() + TTL && Array.isArray(saved.rows)
    && ['relay-on','relay-off','unknown'].includes(saved.mode) && Number.isFinite(saved.started)) {
    const fields = new Set(['at','duration_ms','dns_ms','connect_ms','tls_ms','ttfb_ms','download_ms','transfer_bytes','status','api_ms']);
    const rows: Row[] = saved.rows.slice(-MAX_ROWS).filter((r: Row) => r && typeof r.path === 'string' && diagnosticPath(r.path)
      && ['api','resource','navigation','route','content-ready','mail-ready'].includes(String(r.type))).map((r: Row) => {
      const row: Row = {type:r.type,path:diagnosticPath(String(r.path))};
      for (const k of fields) if (typeof r[k] === 'number' && Number.isFinite(r[k])) row[k] = round(r[k] as number);
      if (/^[a-f0-9-]{36}$/i.test(String(r.request_id))) row.request_id = r.request_id;
      if (['CN_DIRECT','US_PROXY','UNKNOWN'].includes(String(r.ingress))) row.ingress = r.ingress;
      if (['h2','h3','http/1.1','unknown'].includes(String(r.protocol))) row.protocol = r.protocol;
      return row;
    });
    session = { version:1, started:saved.started, expires:saved.expires, active:saved.active===true, mode:saved.mode, rows };
    if (session.active) install();
  } else sessionStorage.removeItem(KEY);
} catch { /* Optional diagnostics only. */ }
