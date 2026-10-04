const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
function safePath(path) {
  if (/^\/api\/(now|activity|projects|posts|updates|site-settings|settings\/public|auth\/me|seo)$/.test(path)) return path;
  if (/^\/api\/posts\/\d+$/.test(path)) return '/api/posts/:id';
  if (/^\/api\/projects\/[\w-]+$/.test(path)) return '/api/projects/:slug';
  if (/^\/api\/mailboxes\/(me|sent|send|folders\/(inbox|sent))$/.test(path)) return path;
  if (/^\/api\/mailboxes\/folders\/(inbox|sent)\/\d+$/.test(path)) return path.replace(/\/\d+$/, '/:uid');
  return null;
}
function createDiagnostics({ env = process.env, emit = value => console.info(value), now = () => performance.now(), wall = Date.now } = {}) {
  let bucket = 0, count = 0;
  return function siteDiagnostics(req, res, next) {
    const path = safePath(req.path);
    if (env.SITE_DIAGNOSTICS_ENABLED === 'false' || req.get('X-Mooncci-Diagnostic') !== '1' || !path) return next();
    const began = now(), id = randomUUID();
    const local = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const candidate = local ? req.get('X-Mooncci-Mail-Ingress') : null;
    const ingress = ['CN_DIRECT','US_PROXY'].includes(candidate) ? candidate : 'UNKNOWN';
    res.setHeader('X-Diagnostic-Request-ID', id);
    res.setHeader('X-Diagnostic-Ingress', ingress);
    const writeHead = res.writeHead;
    res.writeHead = function (...args) {
      res.setHeader('Server-Timing', `app;dur=${Math.max(0, now()-began).toFixed(1)}`);
      res.setHeader('Cache-Control', 'private, no-store');
      return writeHead.apply(this, args);
    };
    let logged = false;
    const record = () => {
      if (logged) return; logged = true;
      const minute = Math.floor(wall()/60000);
      if (minute !== bucket) { bucket = minute; count = 0; }
      if (++count > 60) return;
      const mailId = String(res.getHeader('X-Mail-Request-ID') || '');
      try { emit(JSON.stringify({ event:'site_diagnostic', at:new Date(wall()).toISOString(),
        request_id:/^[a-f0-9-]{36}$/i.test(mailId) ? mailId : id, path, ingress,
        status:res.statusCode, aborted:!res.writableFinished, total_ms:Math.max(0,Math.round((now()-began)*10)/10) })); } catch { /* Never break a response for telemetry. */ }
    };
    res.once('finish', record); res.once('close', record); next();
  };
}
module.exports = { createDiagnostics, safePath };
