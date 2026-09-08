import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
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

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SettingsState>({
    data: null,
    loading: true,
    error: '',
  });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: !current.data, error: '' }));
    api('/settings/site', { signal: controller.signal, cache: 'no-store' })
      .then((data) => {
        if (
          !['brand', 'hero', 'footer'].every(
            (key) =>
              data?.[key] &&
              typeof data[key] === 'object' &&
              !Array.isArray(data[key]),
          )
        ) {
          throw new Error('站点配置格式不正确，请稍后重试。');
        }
        if (!controller.signal.aborted)
          setState({ data, loading: false, error: '' });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState((current) => ({
            ...current,
            loading: false,
            error:
              error instanceof Error ? error.message : '暂时无法读取站点配置。',
          }));
      });
    return () => controller.abort();
  }, [version]);
  useEffect(() => {
    window.addEventListener('site-settings-updated', reload);
    return () => window.removeEventListener('site-settings-updated', reload);
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
