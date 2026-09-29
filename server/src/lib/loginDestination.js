const rules = require('./loginDestinationRules.json');
function loginDestination(value) {
  if (typeof value !== 'string' || !value || value.length > 1000 || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return '';
  const url = new URL(value, 'https://local.invalid');
  if (url.origin !== 'https://local.invalid' || !new RegExp(rules.path).test(url.pathname)) return '';
  const query = new URLSearchParams();
  for (const [key, pattern] of Object.entries(rules.query)) {
    const v = url.searchParams.get(key);
    if (v && new RegExp(pattern).test(v)) query.set(key, v);
  }
  const result = url.pathname + (query.size ? '?' + query.toString() : '') + (new RegExp(rules.hash).test(url.hash) ? url.hash : '');
  return result.length <= 200 ? result : url.pathname;
}
function resetLink(origin,token,destination) {const next=loginDestination(destination);return origin+'/reset-password'+(next?'?redirect='+encodeURIComponent(next):'')+'#token='+encodeURIComponent(token);}
module.exports={loginDestination,resetLink};
