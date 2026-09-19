const { X509Certificate, createPublicKey } = require('node:crypto');
function httpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw Error('config');
  return url.href;
}
async function json(response) {
  if (!response.ok) { await response.body?.cancel(); throw Error('upstream'); }
  let size = 0; const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length; if (size > 262144) throw Error('size'); chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function createDependencyHealth({ env = process.env, fetcher = fetch, now = Date.now, ttl = 60000, timeout = 10000 } = {}) {
  const cache = new Map(); const pending = new Map();
  async function probe(id) {
    const started = now(); const signal = AbortSignal.timeout(timeout);
    const get = url => fetcher(httpsUrl(url), { signal, redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': 'mooncci-dependency-health' } });
    let timer;
    const work = async () => {
      if (id === 'google') {
        const data = await json(await get(env.GOOGLE_CERTS_URL || 'https://google-certs.mooncci.site/google-certs'));
        const certs = Object.values(data);
        if (!certs.length || !certs.some(value => {
          try { const cert = new X509Certificate(value); return Date.parse(cert.validFrom) <= now() && Date.parse(cert.validTo) > now(); } catch { return false; }
        })) throw Error('certificates');
      } else {
        const data = await json(await get('https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration'));
        const jwks = new URL(httpsUrl(data.jwks_uri));
        if (jwks.origin !== 'https://login.microsoftonline.com' || !data.authorization_endpoint || !data.token_endpoint) throw Error('discovery');
        const keys = await json(await get(jwks.href));
        if (!Array.isArray(keys.keys) || !keys.keys.some(key => {
          try { return key.kty === 'RSA' && Boolean(key.kid) && createPublicKey({ key, format: 'jwk' }).asymmetricKeyType === 'rsa'; } catch { return false; }
        })) throw Error('keys');
      }
    };
    let ok = false;
    try {
      await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('timeout')), timeout); })]); ok = true;
    } catch { /* Never expose upstream bodies, URLs or exception messages. */ }
    finally { clearTimeout(timer); }
    return { ok, service: id, scope: 'dependency-connectivity', checkedAt: new Date(now()).toISOString(), responseTimeMs: Math.max(0, now() - started) };
  }
  return async id => {
    if (!['google', 'microsoft', 'github'].includes(id)) return null;
    if (id === 'github') return { ok: false, service: id, status: 'not_configured', scope: 'dependency-connectivity' };
    const saved = cache.get(id);
    if (saved && now() - saved.at < ttl) return saved.result;
    if (!pending.has(id)) pending.set(id, probe(id).then(result => { cache.set(id, { at: now(), result }); return result; }).finally(() => pending.delete(id)));
    return pending.get(id);
  };
}
module.exports = { createDependencyHealth };
