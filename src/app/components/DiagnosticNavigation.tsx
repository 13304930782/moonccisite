import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { visibleDiagnostic } from '../lib/browserDiagnostics';
export function DiagnosticNavigation() {
  const location = useLocation();
  useEffect(() => { visibleDiagnostic(location.pathname, 'route'); }, [location.pathname]);
  return null;
}
