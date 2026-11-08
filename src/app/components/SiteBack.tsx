import type {ReactNode} from 'react';
import { useI18n } from '../i18n';
import { useLocation, useNavigate } from 'react-router-dom';
import {Link} from './LocaleLink';
import { safeRoutePath } from '../lib/safeUrl';
import { splitLocalePath } from '../lib/locale';
import { usePreviousSiteVisit } from './RoutePosition';

export type SiteBackProps = {
  /** Explicit destination means list/parent navigation, never history.back(). */
  to?: string;
  fallback?: string;
  children?: ReactNode;
  variant?: 'text' | 'pill' | 'hero';
  className?: string;
};
export function SiteBack({to, fallback, children, variant='text', className}: SiteBackProps) {
  const { t } = useI18n();
  const previous = usePreviousSiteVisit(), location = useLocation(), navigate = useNavigate();
  const pathname = splitLocalePath(location.pathname).pathname;
  const previousPath = previous && safeRoutePath(previous.path, '');
  const defaultFallback = pathname.startsWith('/admin/') ? '/admin' : pathname.startsWith('/account/') ? '/' : pathname.startsWith('/article/') ? '/articles' : '/';
  const path = safeRoutePath(to || previousPath || fallback || defaultFallback, '/');
  if (!to && pathname === '/') return null;
  const historyBack = !to && !!previousPath;
  return <Link to={path} className={className ?? (variant==='text'?'text-link':variant==='pill'?'quiet-button':'hero-pill')} data-site-back onClick={event => {
    if (historyBack && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      navigate(-1);
    }
  }}>{children ?? t('m_3a14a3c2be')}</Link>;
}
