import { Link, useLocation, useNavigate } from 'react-router-dom';
import { safeRoutePath } from '../lib/safeUrl';
import { usePreviousSiteVisit } from './RoutePosition';

export function SiteBack({ className = 'text-link' }: { className?: string }) {
  const previous = usePreviousSiteVisit(), location = useLocation(), navigate = useNavigate();
  const source = previous && safeRoutePath(previous.path, '');
  const fallback = /^\/article\//.test(location.pathname) ? ['/articles','文章库'] : /^\/updates\//.test(location.pathname) ? ['/updates','最近更新'] : /^\/projects\//.test(location.pathname) ? ['/projects','作品列表'] : ['/', '首页'];
  const path = source || fallback[0];
  if (location.pathname === '/' || /^\/(?:admin(?:-login)?|account)(?:\/|$)/.test(location.pathname)) return null;
  return <Link to={path} className={className} data-site-back onClick={event => {
    if (source && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      navigate(-1);
    }
  }}>← {source?'返回':fallback[1]}</Link>;
}
