import { Link, useLocation, useNavigate } from 'react-router-dom';
import { safeRoutePath } from '../lib/safeUrl';
import { usePreviousSiteVisit } from './RoutePosition';

export function SiteBack({ className = 'text-link' }: { className?: string }) {
  const previous = usePreviousSiteVisit(), location = useLocation(), navigate = useNavigate();
  const path = previous && safeRoutePath(previous.path, '');
  if (!path || location.pathname === '/' || /^\/(?:admin(?:-login)?|account)(?:\/|$)/.test(location.pathname)) return null;
  return <Link to={path} className={className} data-site-back onClick={event => {
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      navigate(-1);
    }
  }}>← 返回</Link>;
}
