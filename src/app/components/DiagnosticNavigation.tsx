import { useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { navigationDiagnostic, visibleDiagnostic } from '../lib/browserDiagnostics';
export function DiagnosticNavigation() {
  const location = useLocation(), type=useNavigationType();
  useLayoutEffect(() => {
    document.documentElement.dataset.navigationType=type;
    navigationDiagnostic(location.pathname,location.key);
    visibleDiagnostic(location.pathname, 'route');
  }, [location.key, location.pathname, type]);
  return null;
}
