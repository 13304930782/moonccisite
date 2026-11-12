import {createContext, startTransition, useCallback, useContext, useEffect, useRef, useState, type ReactNode} from 'react';
import {useLocation, useNavigate, useNavigationType} from 'react-router-dom';
import {api} from '../lib/api';
import {languageLoadError, localizedPath, preferenceKey, readLanguage, sessionPreferenceKey, splitLocalePath, systemLocale, type LanguagePreference, type Locale, type StoredLanguage} from '../lib/locale';
import {ensureMessages} from '../i18n';
import {useDocumentHydration} from './DocumentData';

type LocaleState = {
  uiLocale: Locale; contentLocale: Locale; preference: LanguagePreference;
  ready: boolean; languageError: string;
  setLocale: (locale: LanguagePreference) => void;
};
const Context = createContext<LocaleState>({uiLocale:'zh-CN',contentLocale:'zh-CN',preference:'system',ready:false,languageError:'',setLocale:()=>{}});
export const useLocale = () => useContext(Context);
const browserLanguage = () => systemLocale(navigator.languages || [navigator.language]);
const safeStorage = (kind: 'localStorage' | 'sessionStorage') => {try {return window[kind];} catch {return undefined;}};
function persist(value: StoredLanguage) {
  for (const [kind,key] of [['localStorage',preferenceKey],['sessionStorage',sessionPreferenceKey]] as const) {
    try {safeStorage(kind)?.setItem(key,JSON.stringify(value));} catch { /* Memory preference remains usable when persistence is blocked. */ }
  }
}

/** Lives outside page routes: editing state and the latest preference survive content navigation. */
export function LocaleProvider({children}: {children: ReactNode}) {
  const location = useLocation(), navigate = useNavigate(), navigation = useNavigationType();
  const hydration = useDocumentHydration();
  const contentLocale = splitLocalePath(location.pathname).locale;
  const [uiLocale,setUiLocale] = useState<Locale>(contentLocale);
  const [preference,setPreference] = useState<LanguagePreference>('system');
  const [ready,setReady]=useState(false),[languageError,setLanguageError]=useState('');
  const effective = useRef<StoredLanguage | null>(null);
  const mounted = useRef(false), request = useRef(0);
  const route = useRef(location); route.current = location;
  const lastKey = useRef(location.key);
  const selection = useRef(0);

  const normalize = useCallback(async (locale: Locale, preserveScroll = false) => {
    const current = route.current, identity = splitLocalePath(current.pathname).pathname;
    let target = localizedPath(current.pathname + current.search + current.hash,locale);
    if (target === current.pathname + current.search + current.hash) return;
    const generation = ++request.current;
    // A preference cannot turn an untranslated article into a fictional English page.
    const detail = /^\/(article|projects|updates|series)\/([^/]+)$/.exec(identity);
    if (locale === 'en' && detail) {
      try {
        await api('/' + (detail[1] === 'article' ? 'posts' : detail[1]) + '/' + detail[2] + '?locale=en');
      } catch { return; }
      if (generation !== request.current || route.current.key !== current.key) return;
    }
    if (current.hash && /^\/(article|projects|updates)\//.test(identity)) target = target.split('#')[0];
    const scroll = window.scrollY;
    navigate(target,{replace:true,preventScrollReset:true,state:{...current.state,mooncciLanguageReplace:preserveScroll,mooncciLanguageScroll:scroll}});
  },[navigate]);

  const applyLocale = useCallback(async (locale: Locale, changeUrl: boolean, preserveScroll = false) => {
    const version = ++selection.current;
    setLanguageError('');
    try { await Promise.all([ensureMessages(locale),hydration]); } catch { if(version===selection.current)setLanguageError(languageLoadError(locale));return; }
    if (version !== selection.current) return;
    startTransition(() => { setUiLocale(locale);setReady(true); });
    if (changeUrl) await normalize(locale,preserveScroll);
  },[hydration,normalize]);
  const setLocale = useCallback((next: LanguagePreference) => {
    const value = {preference:next,version:Math.max(Date.now(),(effective.current?.version || 0)+1)};
    effective.current = value; request.current++; persist(value);
    setPreference(next);
    const locale = next === 'system' ? browserLanguage() : next;
    void applyLocale(locale,true,true);
  },[applyLocale]);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    const stored = readLanguage(safeStorage('localStorage'));
    const session = readLanguage(safeStorage('sessionStorage'),sessionPreferenceKey);
    const restored = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'back_forward';
    effective.current = restored && session && (!stored || session.version > stored.version) ? session : stored;
    const selected = effective.current?.preference || 'system';
    const locale = selected === 'system' ? browserLanguage() : selected;
    // Explicit shared links retain their content; only the neutral home entry auto-selects a URL.
    void applyLocale(locale,restored || location.pathname === '/',restored);
    const initialSelection=selection.current;
    void Promise.resolve(hydration).then(() => { if(initialSelection===selection.current) startTransition(() => setPreference(selected)); });
  },[applyLocale,hydration]);

  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      const latest = readLanguage(safeStorage('localStorage'));
      if (latest && latest.version > (effective.current?.version || 0)) effective.current = latest;
      const choice = effective.current?.preference || 'system';
      setPreference(choice);
      const language = choice === 'system' ? browserLanguage() : choice;
      void applyLocale(language,true,true);
    };
    window.addEventListener('pageshow',restore);
    return () => window.removeEventListener('pageshow',restore);
  },[applyLocale]);

  useEffect(() => {
    if (lastKey.current === location.key) return;
    lastKey.current = location.key; request.current++;
    // Initial POP is not Back. Only mounted traversal/navigation uses the active preference.
    if (!mounted.current) return;
    const selected = effective.current?.preference || 'system';
    void applyLocale(selected === 'system' ? browserLanguage() : selected,true,navigation === 'POP');
  },[location.key,navigation,applyLocale]);

  return <Context.Provider value={{uiLocale,contentLocale,preference,ready,languageError,setLocale}}>{children}</Context.Provider>;
}
