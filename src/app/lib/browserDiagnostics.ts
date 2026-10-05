// Opt-in, tab-local measurements. No payloads, query strings or identity.
const KEY = 'mooncci.diagnostics.v1';
const TTL = 20 * 60 * 1000;
const MAX_ROWS = 500;
type Row = Record<string, string | number | boolean | null>;
type Session = { version: 1; started: number; expires: number; active: boolean; mode: 'relay-on' | 'relay-off' | 'unknown'; rows: Row[] };
let session: Session | null = null;
let navigation = {id: Date.now(), path: '', key: ''};
export function navigationDiagnostic(path: string, key = '') {
  const safe=diagnosticPath(path);
  if (!safe) return;
  if (navigation.path !== safe || (key && navigation.key && navigation.key !== key)) navigation={id:navigation.id+1,path:safe,key};
  else if (key) navigation.key=key;
}
export function navigationCodeReady(path: string) { visibleDiagnostic(path,'code-ready'); }

const listeners = new Set<() => void>();
let observer: PerformanceObserver | undefined;
let expiry: ReturnType<typeof setTimeout> | undefined;
const round = (v: number) => Number.isFinite(v) ? Math.max(0, Math.round(v * 10) / 10) : 0;
// Safari can expose responseEnd without responseStart for cached/opaque entries.
// An absent endpoint is unknown, not a phase beginning at navigation time zero.
const interval = (start: number, end: number) => start > 0 && end >= start ? round(end - start) : null;
export function resourceTimingFields(item: PerformanceResourceTiming) {
  return {
    duration_ms: round(item.duration),
    dns_ms: interval(item.domainLookupStart, item.domainLookupEnd),
    connect_ms: interval(item.connectStart, item.connectEnd),
    tls_ms: interval(item.secureConnectionStart, item.connectEnd),
    ttfb_ms: item.responseStart > 0 && item.responseStart >= item.startTime ? round(item.responseStart - item.startTime) : null,
    request_wait_ms: interval(item.requestStart, item.responseStart),
    download_ms: interval(item.responseStart, item.responseEnd),
    transfer_bytes: round(item.transferSize),
    protocol: /^(h2|h3|http\/1\.1)$/.test(item.nextHopProtocol) ? item.nextHopProtocol : 'unknown',
  };
}
function navigationIntent(event: MouseEvent) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
  const link = event.target.closest('a[href]');
  if (!link || link.hasAttribute('download') || (link.getAttribute('target') && link.getAttribute('target') !== '_self')) return;
  let url: URL; try { url = new URL(link.getAttribute('href') || '', location.href); } catch { return; }
  if (url.origin !== location.origin || url.pathname === location.pathname) return;
  const path = diagnosticPath(url.pathname);
  if (path && !path.startsWith('/api/') && !path.startsWith('/assets/')) { navigation={id:navigation.id+1,path,key:''}; add({type: 'navigation-intent', path, at: Date.now(), navigation_id:navigation.id}); }
}

export function diagnosticPath(value: string): string | null {
  const pathname = value.split(/[?#]/, 1)[0];
  if (/^\/(?:|articles|projects|updates|login|register|search|account\/mailbox|admin\/mailbox|diagnostics)$/.test(pathname)) return pathname;
  if (/^\/article\/(?:\d+|:id)$/.test(pathname)) return '/article/:id';
  if (/^\/projects\/(?:[\w-]+|:slug)$/.test(pathname)) return '/projects/:slug';
  if (/^\/assets\/[^/]+$/.test(pathname)) return '/assets/:asset';
  if (/^\/api\/(?:now|activity|projects|posts|updates|site-settings|settings\/public|auth\/me|auth\/login|auth\/register|auth\/providers|auth\/google|login-settings\/public|posts\/meta\/(?:categories|tags)|seo)$/.test(pathname)) return pathname;
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
  if (typeof document !== 'undefined') {
    document.removeEventListener('click', navigationIntent, true);
    document.addEventListener('click', navigationIntent, true);
  }
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        const item = entry as PerformanceResourceTiming;
        let url: URL; try { url = new URL(item.name); } catch { continue; }
        if (url.origin !== location.origin || performance.timeOrigin + item.startTime < (session?.started || 0)) continue;
        const path = diagnosticPath(url.pathname); if (!path) continue;
        add({ type: item.entryType, path, at: Math.round(performance.timeOrigin + item.startTime), ...resourceTimingFields(item) });
      }
    });
    observer.observe({ entryTypes: ['resource', 'navigation'] });
    for (const entry of performance.getEntriesByType('navigation')) {
      const n = entry as PerformanceNavigationTiming, path = diagnosticPath(location.pathname);
      if (path && n.loadEventEnd > 0 && performance.timeOrigin >= (session?.started || 0)) add({ type: 'navigation', path, at: Math.round(performance.timeOrigin), ...resourceTimingFields(n) });
    }
  } catch { /* Measurements must never interrupt application requests. */ }
}
export function startDiagnostics(mode: Session['mode']) {
  session = { version: 1, started: Date.now(), expires: Date.now() + TTL, active: true, mode, rows: [] };
  persist(); install();
}
export function stopDiagnostics() { if (session) session.active = false; observer?.disconnect(); clearTimeout(expiry); if (typeof document !== 'undefined') document.removeEventListener('click', navigationIntent, true); persist(); }
export function clearDiagnostics() { stopDiagnostics(); session = null; persist(); }
export function visibleDiagnostic(path: string, stage: 'route' | 'content-ready' | 'mail-ready' | 'code-ready' | 'interactive' | 'motion-complete') {
  const safe = diagnosticPath(path); if (safe) { navigationDiagnostic(path); add({ type: stage, path: safe, at: Date.now(), navigation_id:navigation.id }); }
}
export function beginApiDiagnostic(path: string) {
  const safe = diagnosticPath('/api' + path);
  if (!safe || !diagnosticsActive()) return null;
  const navId = navigation.id;
  const current = session, began = performance.now(), at = Date.now();
  let status = 0, requestId = '', ingress = 'UNKNOWN', apiMs: number | null = null;
  return {
    response(response: Response) {
      status = response.status;
      const id = response.headers.get('X-Mail-Request-ID') || response.headers.get('X-Diagnostic-Request-ID') || '';
      requestId = /^[a-f0-9-]{36}$/i.test(id) ? id : '';
      const rawIngress = response.headers.get('X-Diagnostic-Ingress');
      if (rawIngress === 'CN_DIRECT' || rawIngress === 'US_PROXY' || rawIngress === 'HK_LOCAL_TEST') ingress = rawIngress;
      const duration = response.headers.get('Server-Timing')?.match(/(?:^|,)\s*app;dur=([\d.]+)/)?.[1];
      if (duration && Number.isFinite(Number(duration))) apiMs = round(Number(duration));
    },
    finish() {
      if (session !== current) return;
      add({ type: 'api', path: safe, at, navigation_id:navId, duration_ms: round(performance.now() - began), status, request_id: requestId, ingress, api_ms: apiMs });
    },
  };
}
export function exportDiagnostics() {
  return JSON.stringify({ ...session, build: import.meta.env.VITE_BUILD_REVISION || 'unknown',
    note: 'Device timings; relay mode is user-selected. Null phases are unavailable. connect_ms includes TLS; ttfb_ms includes queue/connect time. navigation-intent is a link click, route is component commit, content-ready is per component. No payloads or complete URLs are collected.' }, null, 2);
}
try {
  const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
  if (saved?.version === 1 && saved.expires > Date.now() && saved.expires <= Date.now() + TTL && Array.isArray(saved.rows)
    && ['relay-on','relay-off','unknown'].includes(saved.mode) && Number.isFinite(saved.started)) {
    const fields = new Set(['navigation_id','at','duration_ms','dns_ms','connect_ms','tls_ms','ttfb_ms','request_wait_ms','download_ms','transfer_bytes','status','api_ms']);
    const rows: Row[] = saved.rows.slice(-MAX_ROWS).filter((r: Row) => r && typeof r.path === 'string' && diagnosticPath(r.path)
      && ['api','resource','navigation','navigation-intent','route','content-ready','mail-ready','code-ready','interactive','motion-complete'].includes(String(r.type))).map((r: Row) => {
      const row: Row = {type:r.type,path:diagnosticPath(String(r.path))};
      for (const k of fields) {
        if (typeof r[k] === 'number' && Number.isFinite(r[k])) row[k] = round(r[k] as number);
        else if (r[k] === null) row[k] = null;
      }
      if (/^[a-f0-9-]{36}$/i.test(String(r.request_id))) row.request_id = r.request_id;
      if (['CN_DIRECT','US_PROXY','HK_LOCAL_TEST','UNKNOWN'].includes(String(r.ingress))) row.ingress = r.ingress;
      if (['h2','h3','http/1.1','unknown'].includes(String(r.protocol))) row.protocol = r.protocol;
      return row;
    });
    session = { version:1, started:saved.started, expires:saved.expires, active:saved.active===true, mode:saved.mode, rows };
    if (session.active) install();
  } else sessionStorage.removeItem(KEY);
} catch { /* Optional diagnostics only. */ }
