import {createContext, startTransition, useContext, useEffect, useState, type ReactNode} from 'react';

export type DocumentData = {status?: number; url?: string; seo?: any; resources: Record<string, any>; errors?: Record<string, number>; collect?: Set<string>};
const Context = createContext<DocumentData | null>(null);
const HydrationContext = createContext<{ready: Promise<void>; complete: () => void} | null>(null);
/** Request-local during SSR; only seeds the first client render, never a public detail cache. */
export function DocumentDataProvider({data, children}: {data?: DocumentData; children: ReactNode}) {
  const [active, setActive] = useState(true);
  const [hydration] = useState(() => {
    let resolve!: () => void;
    const ready = new Promise<void>(done => { resolve = done; });
    if (!data) resolve();
    return {ready, complete: () => { setActive(false); resolve(); }};
  });
  return <HydrationContext.Provider value={hydration}><Context.Provider value={active ? data || null : {resources:{},status:data?.status}}>{children}</Context.Provider></HydrationContext.Provider>;
}
/** Retire the seed after the enclosing route boundary commits, not the provider mount. */
export function DocumentReady({onReady}: {onReady: () => void}) {
  const hydration = useContext(HydrationContext);
  useEffect(() => { startTransition(() => { hydration?.complete(); onReady(); }); }, [hydration, onReady]);
  return null;
}
export const useDocumentHydration = () => useContext(HydrationContext)?.ready;
export function useDocumentResource(path: string, enabled = true) {
  const data = useContext(Context);
  if (enabled) data?.collect?.add(path);
  return enabled ? {data: data?.resources[path], status: data?.errors?.[path]} : {};
}

export const useDocumentStatus = () => useContext(Context)?.status;

export const useDocumentMetadata = () => { const data=useContext(Context); return data?.seo ? {url:data.url,meta:data.seo} : null; };
