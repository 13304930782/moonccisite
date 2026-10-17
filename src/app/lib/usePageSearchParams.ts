import { useCallback, useRef } from 'react';
import { createSearchParams, useLocation, useNavigate, useSearchParams, type SetURLSearchParams, type URLSearchParamsInit } from 'react-router-dom';

// Router owns history; this adapter keeps fragments when only the query changes.
export function usePageSearchParams(defaultInit?: URLSearchParamsInit): ReturnType<typeof useSearchParams> {
  const [params] = useSearchParams(defaultInit);
  const location = useLocation(), navigate = useNavigate();
  const latest = useRef(params); latest.current = params;
  const setParams: SetURLSearchParams = useCallback((next, options) => {
    const query = createSearchParams(typeof next === 'function' ? next(new URLSearchParams(latest.current)) : next);
    if (query.toString() === latest.current.toString()) return;
    latest.current = query;
    const hash = typeof window === 'undefined' ? location.hash : window.location.hash;
    navigate({ pathname: location.pathname, search: query.size ? '?' + query : '', hash }, options);
  }, [location.pathname, location.hash, navigate]);
  return [params, setParams];
}
