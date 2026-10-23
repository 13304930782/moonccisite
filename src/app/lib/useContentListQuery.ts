import { useSearchParams } from 'react-router-dom';

export function useContentListQuery() {
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get('page'));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  function update(values: Record<string, string>, replace = false) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(values)) {
        if (value) next.set(key, value); else next.delete(key);
      }
      return next;
    }, { replace });
  }
  function setPage(value: number) { update({ page: value > 1 ? String(value) : '' }); }
  return { params, page, setPage, update };
}
