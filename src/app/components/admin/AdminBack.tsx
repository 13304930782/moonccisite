import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePreviousSiteVisit } from '../RoutePosition';
import { safeRoutePath } from '../../lib/safeUrl';

export function useAdminListReturn(fallback: string) {
  const previous = usePreviousSiteVisit();
  const path = previous && safeRoutePath(previous.path, '');
  const knownList = !!path && path.split(/[?#]/)[0] === fallback.split(/[?#]/)[0];
  return { to: knownList ? path : fallback, canBack: knownList };
}

// A labeled list return keeps its destination, using Router history only when proven.
export function AdminBack({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  const target = useAdminListReturn(to), navigate = useNavigate();
  return <Link to={target.to} className={className} onClick={event => {
    if (target.canBack && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault(); navigate(-1);
    }
  }}>{children}</Link>;
}
