import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

export function useAdminList<T>(endpoint: string, filters: Record<string, string>) {
  const [page, setPage] = useState(1);
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
      if (data.page !== page) setPage(data.page);
    }).catch(e => {
      if (active && current.current === query) { setError(e.message || '列表加载失败'); setTotal(0); }
    }).finally(() => { if (active && current.current === query) setLoading(false); });
    return () => { active = false; };
  }, [query, version]);
  const reload = useCallback(() => setVersion(v => v + 1), []);
  return { items, total, page, setPage, loading, error, reload };
}
