export type Locale = 'zh-CN' | 'en';
export type LanguagePreference = Locale | 'system';
export const preferenceKey = 'mooncci:language';
export const sessionPreferenceKey = 'mooncci:language-session';
export function systemLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    if (/^en(?:-|$)/i.test(language)) return 'en';
    if (/^zh(?:-|$)/i.test(language)) return 'zh-CN';
  }
  return 'zh-CN';
}
export function splitLocalePath(path: string): {locale: Locale; pathname: string} {
  return path === '/en' || path.startsWith('/en/')
    ? {locale:'en', pathname:path.slice(3) || '/'} : {locale:'zh-CN', pathname:path};
}
export function publicLanguagePath(path: string) {
  return /^\/(?:$|articles$|article\/[^/]+$|updates(?:\/[^/]+)?$|projects(?:\/[^/]+)?$|about$|links$|archives$|series(?:\/[^/]+)?$|tags?$|tag\/[^/]+$|categories$|category\/[^/]+$|search$|rss$|early-access$|mail-setup$)/.test(path);
}
export function localizedPath(path: string, locale: Locale): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  const match = /^([^?#]*)(.*)$/.exec(path)!;
  const {pathname} = splitLocalePath(match[1]);
  if (!publicLanguagePath(pathname)) return path;
  return (locale === 'en' ? '/en' + (pathname === '/' ? '' : pathname) : pathname) + match[2];
}
export function localeResource(path: string, locale: Locale): string {
  if (locale !== 'en' || !/^\/(?:posts(?:\/|\?|$)|now(?:\?|$)|activity(?:\?|$)|projects(?:\/|\?|$)|updates(?:\/|\?|$)|series(?:\/|\?|$)|settings\/(?:site|blog-pages)(?:\?|$))/.test(path)) return path;
  const url = new URL(path, 'https://locale.invalid');
  if (!url.searchParams.has('locale')) url.searchParams.set('locale', locale);
  return url.pathname + url.search;
}
export type StoredLanguage = {preference: LanguagePreference; version: number};
export function readLanguage(storage: Pick<Storage, 'getItem'> | undefined, key = preferenceKey): StoredLanguage | null {
  try {
    const value = JSON.parse(storage?.getItem(key) || 'null');
    return value && ['zh-CN','en','system'].includes(value.preference) && Number.isSafeInteger(value.version) && value.version > 0 ? value : null;
  } catch { return null; }
}

export const languageLoadError = (locale: Locale) => locale === 'en' ? 'Unable to load language. Please retry.' : '语言加载失败，请重试。';
