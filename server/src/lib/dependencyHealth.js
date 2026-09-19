const { X509Certificate, createPublicKey } = require('node:crypto');
class ProbeError extends Error { constructor(reason) { super(reason); this.reason = reason; } }
const fail = reason => new ProbeError(reason);
function diagnostic(value) {
  if (!value) return 'missing';
  return /^(?:request_rejected|upstream_ok|upstream_http_[1-5][0-9]{2}|upstream_redirect_3[0-9]{2}_(?:missing_location|same_endpoint|github_api|github_web|other_origin|invalid_location)|(?:request_body|upstream_fetch|upstream_body)_(?:size_limit|timeout|cache_unsupported|signal_unsupported|redirect_error|type_error|exception))$/.test(value) ? value : 'unrecognized';
}
const networkCodes = new Set(['ENOTFOUND','EAI_AGAIN','ECONNRESET','ECONNREFUSED','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID']);
function httpsUrl(value) {
  let url; try { url = new URL(value); } catch { throw fail('config'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw fail('config');
  return url.href;
}
async function json(response) {
  if (!response.ok) { await response.body?.cancel(); throw fail('upstream'); }
  let size = 0; const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length; if (size > 262144) throw fail('size'); chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail('invalid_json'); }
}
function createDependencyHealth({ env = process.env, fetcher = fetch, now = Date.now, ttl = 60000, timeout = 10000, logger = event => console.warn('[dependency-health]', JSON.stringify(event)) } = {}) {
  const cache = new Map(); const pending = new Map(); const previous = new Map();
  async function probe(id) {
    const started = now(); const signal = AbortSignal.timeout(timeout);
    let stage = 'configuration', responseStatus = null, proxyDiagnostic = null, proxyVersion = null;
    const get = async (url, headers = {}) => {
      const target = httpsUrl(url);
      stage = id === 'github' ? 'proxy_request' : 'upstream_request';
      responseStatus = null;
      const response = await fetcher(target, { signal, redirect: 'error', headers: { Accept: 'application/json', 'User-Agent': 'mooncci-dependency-health', ...headers } });
      responseStatus = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : null;
      stage = 'response_validation';
      if (id === 'github') {
        proxyDiagnostic = diagnostic(response.headers.get('X-Mooncci-Proxy-Diagnostic'));
        const version = response.headers.get('X-Mooncci-Proxy-Version');
        proxyVersion = !version ? 'missing' : ['1','2','3'].includes(version) ? version : 'unrecognized';
      }
      return response;
    };
    let timer;
    const work = async () => {
      if (id === 'google') {
        const data = await json(await get(env.GOOGLE_CERTS_URL || 'https://google-certs.mooncci.site/google-certs'));
        const certs = Object.values(data);
        if (!certs.length || !certs.some(value => {
          try { const cert = new X509Certificate(value); return Date.parse(cert.validFrom) <= now() && Date.parse(cert.validTo) > now(); } catch { return false; }
        })) throw fail('certificates');
      } else if (id === 'github') {
        const origin = new URL(httpsUrl(env.GITHUB_OAUTH_PROXY_URL || ''));
        const key = env.GITHUB_OAUTH_PROXY_KEY || '';
        if (origin.pathname !== '/' || origin.search || !/^[a-f0-9]{64}$/.test(key)) throw fail('config');
        // Probe only the existing configured proxy. Never follow redirects with its key.
        // An intentionally invalid token verifies upstream reachability, not user login.
        const response = await get(origin.origin + '/user', {
          'X-Mooncci-Proxy-Key': key,
          Authorization: 'Bearer mooncci_monitor_invalid_token',
        });
        await response.body?.cancel();
        if (response.status !== 401 || response.headers.get('X-Mooncci-Proxy-Diagnostic') !== 'upstream_http_401' || response.headers.get('X-Mooncci-Proxy-Version') !== '3') throw fail('unexpected_proxy_response');
      } else {
        const data = await json(await get('https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration'));
        const jwks = new URL(httpsUrl(data.jwks_uri));
        if (jwks.origin !== 'https://login.microsoftonline.com' || !data.authorization_endpoint || !data.token_endpoint) throw fail('discovery');
        const keys = await json(await get(jwks.href));
        if (!Array.isArray(keys.keys) || !keys.keys.some(key => {
          try { return key.kty === 'RSA' && Boolean(key.kid) && createPublicKey({ key, format: 'jwk' }).asymmetricKeyType === 'rsa'; } catch { return false; }
        })) throw fail('keys');
      }
    };
    let ok = false, reason = null, networkCode = null;
    try {
      await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(fail('timeout')), timeout); })]); ok = true;
    } catch (error) {
      const code = error?.cause?.code || error?.code;
      networkCode = networkCodes.has(code) ? code : null;
      reason = error instanceof ProbeError ? error.reason : ['AbortError','TimeoutError'].includes(error?.name) ? 'timeout' : networkCode ? 'network' : 'request_failed';
    }
    finally { clearTimeout(timer); }
    const result = { ok, service: id, scope: 'dependency-connectivity', checkedAt: new Date(now()).toISOString(), responseTimeMs: Math.max(0, now() - started) };
    // Log actual probes only, never cache hits. Whitelisted scalar fields only:
    // no request URL, headers, body, raw exception, proxy key or user token.
    if (!ok || previous.get(id) === false) {
      try { logger({ event: ok ? 'recovered' : 'failed', ...result, stage, reason, responseStatus, proxyDiagnostic, proxyVersion, networkCode }); } catch { /* Logging cannot change probe availability. */ }
    }
    previous.set(id, ok);
    return result;
  }
  return async id => {
    if (!['google', 'microsoft', 'github'].includes(id)) return null;
    const saved = cache.get(id);
    if (saved && now() - saved.at < ttl) return saved.result;
    if (!pending.has(id)) pending.set(id, probe(id).then(result => { cache.set(id, { at: now(), result }); return result; }).finally(() => pending.delete(id)));
    return pending.get(id);
  };
}
module.exports = { createDependencyHealth };
