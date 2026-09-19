const https = require('node:https');
function ipv4Options(value, env = process.env) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return {};
    const google = new URL((env.GOOGLE_CERTS_URL || 'https://google-certs.mooncci.site/google-certs').trim());
    if (url.href === google.href) return { family: 4, autoSelectFamily: false };
    if (env.GITHUB_OAUTH_PROXY_URL) {
      const github = new URL(env.GITHUB_OAUTH_PROXY_URL.trim());
      if (github.protocol === 'https:' && !github.username && !github.password && github.pathname === '/' && !github.search && !github.hash && url.origin === github.origin && ['/token','/user','/emails'].includes(url.pathname) && !url.search && !url.hash) return { family: 4, autoSelectFamily: false };
    }
  } catch { /* Invalid configuration is rejected by its existing caller. */ }
  return {};
}
// Only the configured proxy endpoints use this bounded IPv4 transport. No global
// DNS changes, TLS bypass, redirects, retries or replay of OAuth token exchange.
function fetchScoped(value, options = {}) {
  const network = ipv4Options(value);
  if (!network.family) return globalThis.fetch(value, options);
  return new Promise((resolve, reject) => {
    const signal = options.signal || AbortSignal.timeout(10000);
    const req = https.request(value, { ...network, method: options.method || 'GET', headers: Object.fromEntries(new Headers(options.headers)), signal, agent: false }, res => {
      const chunks = []; let size = 0;
      res.on('error', reject);
      res.on('aborted', () => reject(Object.assign(new Error('Proxy response interrupted'), {code:'ECONNRESET'})));
      if (res.statusCode >= 300 && res.statusCode < 400) { res.resume(); req.destroy(); reject(new Error('Proxy redirect rejected')); return; }
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 262144) { req.destroy(); reject(new Error('Proxy response exceeds limit')); return; }
        chunks.push(chunk);
      });
      res.on('end', () => {
        if (!res.complete) { reject(Object.assign(new Error('Proxy response interrupted'), {code:'ECONNRESET'})); return; }
        const headers = new Headers();
        for (const [key, value] of Object.entries(res.headers)) if (value !== undefined) for (const item of Array.isArray(value) ? value : [value]) headers.append(key,item);
        try { resolve(new Response([204,205,304].includes(res.statusCode) ? null : Buffer.concat(chunks), {status:res.statusCode,headers})); } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.end(options.body);
  });
}
module.exports = { fetch: fetchScoped, ipv4Options };
