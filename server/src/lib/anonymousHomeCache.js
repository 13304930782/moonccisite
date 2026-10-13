// One bounded, public-only document. Never retain credentials or error pages.
const policy = 'public, max-age=0, s-maxage=15, must-revalidate';
function eligible(req) {
  return ['GET', 'HEAD'].includes(req.method) && req.originalUrl === '/' &&
    !['cookie', 'authorization', 'proxy-authorization', 'range', 'x-mooncci-preview', 'x-mooncci-diagnostic'].some(h => req.headers[h]);
}
function createAnonymousHomeCache({ now = Date.now, ttl = 15000 } = {}) {
  let entry, pending;
  return async function anonymousHomeCache(req, res, next) {
    if (req.path !== '/') return next();
    res.vary('Cookie'); res.vary('Authorization'); res.vary('Proxy-Authorization'); res.vary('Range'); res.vary('X-Mooncci-Preview'); res.vary('X-Mooncci-Diagnostic');
    if (!eligible(req)) { res.set('X-Home-Cache', 'BYPASS'); return next(); }
    while (pending) await pending;
    if (entry && now() - entry.created < ttl) {
      res.set('Cache-Control', policy).set('Age', String(Math.floor((now() - entry.created) / 1000))).set('X-Home-Cache', 'HIT');
      return res.status(200).type('html').send(entry.body);
    }
    entry = undefined;
    let release;
    pending = new Promise(resolve => { release = resolve; });
    const gate = pending;
    const done = () => { if (pending === gate) pending = undefined; release(); };
    res.once('finish', done); res.once('close', done);
    const send = res.send;
    res.send = function(body) {
      if (res.locals.publicHomeComplete && res.statusCode === 200 && !res.getHeader('Set-Cookie') && typeof body === 'string' && Buffer.byteLength(body) <= 1024 * 1024) {
        entry = { body, created: now() };
        res.set('Cache-Control', policy).set('Age', '0').set('X-Home-Cache', 'MISS');
      }
      return send.call(this, body);
    };
    next();
  };
}
module.exports = { createAnonymousHomeCache, eligible, policy };
