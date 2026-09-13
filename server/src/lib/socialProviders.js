const { callbackUrl } = require('./socialConfig');
const crypto = require('crypto');
const endpoints = {
  google: 'https://accounts.google.com/o/oauth2/v2/auth',
  github: 'https://github.com/login/oauth/authorize',
  gitee: 'https://gitee.com/oauth/authorize',
  qq: 'https://graph.qq.com/oauth2.0/authorize',
  wechat: 'https://open.weixin.qq.com/connect/qrconnect',
};
function authorizationUrl(provider, config, state, verifier) {
  if (!Object.hasOwn(endpoints, provider)) throw new Error('Unsupported authorization provider');
  const url = new URL(endpoints[provider]);
  url.searchParams.set(provider === 'wechat' ? 'appid' : 'client_id', config.client_id);
  url.searchParams.set('redirect_uri', callbackUrl(provider));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  url.searchParams.set('scope', { google: 'openid email profile', github: 'read:user user:email', gitee: 'user_info', qq: 'get_user_info', wechat: 'snsapi_login' }[provider]);
  if (provider === 'google') {
    url.searchParams.set('response_type', 'id_token');
    url.searchParams.set('response_mode', 'fragment');
    url.searchParams.set('nonce', verifier);
    url.searchParams.set('prompt', 'select_account');
  }
  if (provider === 'github') {
    url.searchParams.set('code_challenge', crypto.createHash('sha256').update(verifier).digest('base64url'));
    url.searchParams.set('code_challenge_method', 'S256');
  }
  if (provider === 'wechat') url.hash = 'wechat_redirect';
  return url.href;
}
function githubTransport(url, options) {
  const routes = {
    'https://github.com/login/oauth/access_token': '/token',
    'https://api.github.com/user': '/user',
    'https://api.github.com/user/emails': '/emails',
  };
  if (!Object.hasOwn(routes, url)) return { url, options };
  const origin = (process.env.GITHUB_OAUTH_PROXY_URL || '').trim();
  const key = (process.env.GITHUB_OAUTH_PROXY_KEY || '').trim();
  if (!origin && !key) return { url, options };
  let parsed;
  try { parsed = new URL(origin); } catch { throw new Error('proxy_config_invalid'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/' || !/^[a-f0-9]{64}$/.test(key)) throw new Error('proxy_config_invalid');
  return { url: parsed.origin + routes[url], options: { ...options, headers: { ...options.headers, 'X-Mooncci-Proxy-Key': key } } };
}
async function request(url, options = {}) {
  ({ url, options } = githubTransport(url, options));
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json', 'User-Agent': 'mooncci-login', ...options.headers } });
  if (!response.ok) throw Object.assign(new Error('provider_http'), { oauthStatus: response.status });
  // Bound streaming response before parsing; do not include upstream bodies/URLs in logs.
  let bytes = 0; const chunks = [];
  for await (const chunk of response.body) {
    bytes += chunk.length; if (bytes > 256 * 1024) throw new Error('OAuth response too large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  let data;
  try { data = JSON.parse(text); } catch { data = Object.fromEntries(new URLSearchParams(text)); }
  if (!data || data.error || data.errcode || (data.ret !== undefined && data.ret !== 0)) throw Object.assign(new Error('provider_rejected'), { oauthUpstream: data?.error });
  return data;
}
const get = (url, params) => request(`${url}?${new URLSearchParams(params)}`);
const post = (url, params) => request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
function subject(value) {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^[A-Za-z0-9_-]{1,128}$/.test(String(value))) throw new Error('Missing provider identity');
  return String(value);
}
async function exchange(provider, config, secret, code, verifier) {
  const params = { client_id: config.client_id, client_secret: secret, code, redirect_uri: callbackUrl(provider), grant_type: 'authorization_code' };
  let token, profile, id, email = '';
  let emailVerified = false;
  if (provider === 'github' || provider === 'gitee') {
    if (provider === 'github') params.code_verifier = verifier;
    token = await post(provider === 'github' ? 'https://github.com/login/oauth/access_token' : 'https://gitee.com/oauth/token', params);
  } else if (provider === 'qq') {
    token = await get('https://graph.qq.com/oauth2.0/token', { ...params, fmt: 'json' });
  } else if (provider === 'wechat') {
    token = await get('https://api.weixin.qq.com/sns/oauth2/access_token', { appid: config.client_id, secret, code, grant_type: 'authorization_code' });
  } else throw new Error('Unknown provider');
  if (typeof token.access_token !== 'string' || !token.access_token || token.access_token.length > 8192) throw new Error('Missing access token');
  if (provider === 'github') {
    profile = await request('https://api.github.com/user', { headers: { Authorization: `Bearer ${token.access_token}` } });
    id = profile.id;
    const emails = await request('https://api.github.com/user/emails', { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (Array.isArray(emails)) {
      const verified = emails.find(e => e.verified === true && e.primary === true) || emails.find(e => e.verified === true);
      if (verified) { email = verified.email; emailVerified = true; }
    }
  } else if (provider === 'gitee') {
    profile = await get('https://gitee.com/api/v5/user', { access_token: token.access_token }); id = profile.id;
  } else if (provider === 'qq') {
    const identity = await get('https://graph.qq.com/oauth2.0/me', { access_token: token.access_token, fmt: 'json' });
    if (String(identity.client_id) !== config.client_id) throw new Error('QQ application mismatch');
    id = subject(identity.openid);
    profile = await get('https://graph.qq.com/user/get_user_info', { access_token: token.access_token, oauth_consumer_key: config.client_id, openid: id });
  } else {
    id = subject(token.openid);
    profile = await get('https://api.weixin.qq.com/sns/userinfo', { access_token: token.access_token, openid: id, lang: 'zh_CN' });
    if (profile.openid !== id) throw new Error('WeChat identity mismatch');
  }
  return { subject: subject(id), email, emailVerified, name: String(profile.name || profile.nickname || profile.login || provider).slice(0, 80) };
}
function failureCode(error) {
  const known = ['state_invalid','state_expired','authorization_denied','session_expired','config_changed','already_bound','email_exists','disabled','identity_mismatch','nonce_invalid','provider_http','provider_rejected','proxy_config_invalid'];
  if (known.includes(error?.message)) return error.message;
  if (['TimeoutError','AbortError'].includes(error?.name)) return 'provider_timeout';
  if (['ETIMEDOUT','ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','UND_ERR_CONNECT_TIMEOUT'].includes(error?.cause?.code)) return 'provider_network';
  if (['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR','ER_DUP_ENTRY','ER_LOCK_DEADLOCK'].includes(error?.code)) return error.code;
  return 'internal_error';
}
function safeFailure(error, provider, stage, reference) {
  const upstream = ['incorrect_client_credentials','bad_verification_code','redirect_uri_mismatch','invalid_grant','invalid_client','access_denied','incorrect_code_verifier'];
  return { provider, stage, reference, reason: failureCode(error),
    ...(Number.isInteger(error?.oauthStatus) && error.oauthStatus>=100 && error.oauthStatus<=599 ? {http_status:error.oauthStatus}:{}),
    ...(upstream.includes(error?.oauthUpstream) ? {upstream:error.oauthUpstream}:{}) };
}
module.exports = { authorizationUrl, exchange, failureCode, safeFailure };
