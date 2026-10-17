import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, type NavigateOptions } from 'react-router-dom';
import { usePageSearchParams } from './usePageSearchParams';
import { paginationSelector, paginationState } from './pageScroll';
import { api } from './api';

const pageNumber = (value: string | null) => value && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : 1;

// Only list context belongs in the URL; editable records and selections remain local.
export function useAdminListQuery(defaults: Record<string, string>, pageKey = 'page') {
  const [params, setParams] = usePageSearchParams();
  const location = useLocation();
  const filters = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, params.get(key) ?? value]));
  const defaultsKey = JSON.stringify(defaults);
  const changeParams = useCallback((patch: Record<string, string>, options: NavigateOptions = { replace: true }) => setParams(current => {
    const next = new URLSearchParams(current);
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === defaults[key]) next.delete(key); else next.set(key, value);
    }
    return next;
  }, options), [setParams, defaultsKey]);
  const pageOptions = useCallback((target?: Element | null): NavigateOptions => ({ state: paginationState(target?.closest(paginationSelector) || null, location.pathname, location.state) }), [location.pathname, location.state]);
  const setPage = useCallback((value: number | ((page: number) => number), options: NavigateOptions = {}) => setParams(current => {
    const next = new URLSearchParams(current), number = typeof value === 'function' ? value(pageNumber(current.get(pageKey))) : value;
    if (!Number.isSafeInteger(number) || number <= 1) next.delete(pageKey); else next.set(pageKey, String(number));
    return next;
  }, options), [setParams, pageKey]);
  return { filters, page: pageNumber(params.get(pageKey)), changeParams, setPage, pageOptions };
}

export function useAdminList<T>(endpoint: string, defaults: Record<string, string>) {
  const { filters, page, setPage, changeParams } = useAdminListQuery(defaults);
  const [version, setVersion] = useState(0);
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const query = `${endpoint}?${new URLSearchParams({ ...filters, page: String(page), pageSize: '50' })}`;
  const current = useRef(query);
  current.current = query;
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setItems([]);
    api(query).then(data => {
      if (!active || current.current !== query) return;
      setItems(data.items); setTotal(data.total);
      if (data.page !== page) setPage(data.page, { replace: true });
    }).catch(e => {
      if (active && current.current === query) { setError(e.message || '列表加载失败'); setTotal(0); }
    }).finally(() => { if (active && current.current === query) setLoading(false); });
    return () => { active = false; };
  }, [query, version]);
  const reload = useCallback(() => setVersion(v => v + 1), []);
  return { items, total, page, setPage, filters, changeParams, loading, error, reload };
}
