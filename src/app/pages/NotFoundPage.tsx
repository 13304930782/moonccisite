import { useI18n } from '../i18n';

import {Link} from '../components/LocaleLink';
import { SitePage, PageHeading,useResource } from '../components/ContentUI';
import {useLocation} from 'react-router-dom';
import {splitLocalePath} from '../lib/locale';
import {articlePath} from '../lib/articleUrl';
export default function NotFoundPage() {
  const { t } = useI18n();
  const location=useLocation(),route=splitLocalePath(location.pathname),id=/^\/article\/([^/]+)$/.exec(route.pathname)?.[1];
  const original=useResource('/posts/'+(id||'0')+'?locale=zh-CN',route.locale==='en'&&!!id);
  return <SitePage narrow><PageHeading eyebrow="404" title={t("m_e300d92280")}><p>{t("m_71f98007b2")}</p></PageHeading><div className="inline-actions">{original.data?.status==='published'&&<a className="text-link" href={articlePath(original.data,'zh-CN')}>{t("m_bde300932e")}  {t("m_ef169a3801")}</a>}<Link className="neo-button" to="/articles">{t("m_12f8cdc8bc")}</Link><Link className="text-link" to="/">{t("m_d66f4359da")}</Link></div></SitePage>;
}
