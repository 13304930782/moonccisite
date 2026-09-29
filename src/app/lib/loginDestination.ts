import rules from '../../../server/src/lib/loginDestinationRules.json';
export function loginDestination(value: string | null): string {
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
export function authLink(path: string, destination: string): string {
  const safe=loginDestination(destination);
  return path + (safe ? '?redirect=' + encodeURIComponent(safe) : '');
}
export function rememberDestination(value:string){try{sessionStorage.setItem('mooncci:login-task',JSON.stringify({path:loginDestination(value),expires:Date.now()+1800000}));}catch{}}
export function rememberedDestination(){try{const item=JSON.parse(sessionStorage.getItem('mooncci:login-task')||'null');return item?.expires>Date.now()?loginDestination(item.path):'';}catch{return '';}}
