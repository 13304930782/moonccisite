import {createContext, startTransition, useContext, useEffect, useState, type ReactNode} from 'react';

export type DocumentData = {status?: number; resources: Record<string, any>; errors?: Record<string, number>; collect?: Set<string>};
const Context = createContext<DocumentData | null>(null);
/** Request-local during SSR; only seeds the first client render, never a public detail cache. */
export function DocumentDataProvider({data, children}: {data?: DocumentData; children: ReactNode}) {
  const [active, setActive] = useState(true);
  useEffect(() => { startTransition(()=>setActive(false)); }, []);
  return <Context.Provider value={active ? data || null : {resources:{},status:data?.status}}>{children}</Context.Provider>;
}
export function useDocumentResource(path: string, enabled = true) {
  const data = useContext(Context);
  if (enabled) data?.collect?.add(path);
  return enabled ? {data: data?.resources[path], status: data?.errors?.[path]} : {};
}

export const useDocumentStatus = () => useContext(Context)?.status;
