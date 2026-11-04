import {forwardRef} from 'react';
import {Link as RouterLink, type LinkProps} from 'react-router-dom';
import {useLocale} from '../context/LocaleContext';
import {localizedPath,splitLocalePath} from '../lib/locale';

/** Content URLs already carry actual published content language, including Chinese-only fallbacks. */
export const Link = forwardRef<HTMLAnchorElement,LinkProps>(function LocaleLink({to,...props},ref) {
  const {uiLocale} = useLocale();
  const localize = (path: string) => /^\/(?:article|projects|updates|series)\/[^/]+$/.test(splitLocalePath(path.split(/[?#]/)[0]).pathname) ? path : localizedPath(path,uiLocale);
  const target = typeof to === 'string' ? localize(to) : {...to,pathname:to.pathname ? localize(to.pathname) : to.pathname};
  return <RouterLink {...props} to={target} ref={ref}/>;
});
