import { useI18n } from '../i18n';
import {useLocale} from './LocaleContext';
import {localeResource} from '../lib/locale';
import {useDocumentResource} from './DocumentData';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
} from 'react';
import { api } from '../lib/api';

type SiteSettings = {
  brand: Record<string, string>;
  hero: Record<string, string>;
  footer: Record<string, string>;
};
type SettingsState = {
  data: SiteSettings | null;
  loading: boolean;
  error: string;
};
const Context = createContext<(SettingsState & { reload: () => void }) | null>(
  null,
);

const snapshotKey = 'mooncci-public-settings-v1';
function readSnapshot(snapshotKey:string): SiteSettings | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(snapshotKey) || 'null');
    if (!saved || Date.now() - saved.time > 300000) return null;
    return ['brand', 'hero', 'footer'].every(key => saved.data?.[key] && typeof saved.data[key] === 'object' && !Array.isArray(saved.data[key])) ? saved.data : null;
  } catch { return null; }
}

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const {contentLocale}=useLocale();
  const resourcePath=localeResource('/settings/site',contentLocale);
  const key=snapshotKey+':'+contentLocale;
  const initial=useDocumentResource(resourcePath);
  const [state, setState] = useState<SettingsState>(() => { const data = initial.data || readSnapshot(key); return { data, loading: !data, error: '' }; });
  const [version, setVersion] = useState(0);
  const epoch=useRef(0);
  const reload = useCallback(() => {epoch.current++;setVersion((value) => value + 1);}, []);
  useEffect(() => {
    if(initial.data && version===0)return;
    const controller = new AbortController();
    const generation=epoch.current;
    setState((current) => ({ ...current, loading: !current.data, error: '' }));
    api(resourcePath, { signal: controller.signal, cache: 'no-store' })
      .then((data) => {
        if (
          !['brand', 'hero', 'footer'].every(
            (key) =>
              data?.[key] &&
              typeof data[key] === 'object' &&
              !Array.isArray(data[key]),
          )
        ) {
          throw new Error(t("m_23af90b846"));
        }
        if (!controller.signal.aborted && generation===epoch.current) {
          setState({ data, loading: false, error: '' });
          try { sessionStorage.setItem(key, JSON.stringify({ data, time: Date.now() })); } catch {}
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState((current) => ({
            ...current,
            loading: false,
            error:
              error instanceof Error ? error.message : t("m_d993e4c87d"),
          }));
      });
    return () => controller.abort();
  }, [version,resourcePath,key]);
  useEffect(() => {
    const update=()=>{try{for(const locale of ['zh-CN','en'])sessionStorage.removeItem(snapshotKey+':'+locale);}catch{}reload();};
    window.addEventListener('site-settings-updated', update);
    return () => window.removeEventListener('site-settings-updated', update);
  }, [reload]);
  return (
    <Context.Provider value={{ ...state, reload }}>{children}</Context.Provider>
  );
}

export function useSiteSettings() {
  const value = useContext(Context);
  if (!value) throw new Error('useSiteSettings requires SiteSettingsProvider');
  return value;
}
