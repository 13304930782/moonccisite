import { useI18n } from '../i18n';
import { Link } from '../components/LocaleLink';
import { SitePage, PageHeading } from '../components/ContentUI';

export default function EarlyAccessPage({ admin = false }: { admin?: boolean }) {
  const { t } = useI18n();
  const content = <><PageHeading eyebrow="Early Access" title={t('此功能已下线')}><p>{t('本站已停止提供旧版 Early Access 申请与审核。')}</p></PageHeading><div className="inline-actions"><Link className="neo-button neo-button-dark" to={admin ? '/admin' : '/'}>{t(admin ? '返回后台' : '返回首页')}</Link></div></>;
  return admin ? <div className="admin-page">{content}</div> : <SitePage narrow>{content}</SitePage>;
}
