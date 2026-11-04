import { useI18n } from '../i18n';
import {usePublishing} from '../lib/usePublishing';

import {Link} from '../components/LocaleLink';
import { SitePage } from '../components/ContentUI';
import { PostResults } from '../components/PostResults';
import { SiteBack } from '../components/SiteBack';
import '../../styles/articles-v2.css';
export default function ArticlesPage() {
  const { t } = useI18n();
 const publishing=usePublishing();
  return (
    <SitePage className="articles-v2">
      <header className="articles-heading">
        <SiteBack className="articles-back" />
        <h1>{t("m_7d5a89f6b1")}</h1>
        <p>{t("m_13d8bdca8b")}</p>
      </header>
      <nav className="articles-browse" aria-label={t("m_08924faa2f")}>
        <p>{t("m_12f8cdc8bc")}</p>
        <div>
          {publishing && <Link to="/series">{t("m_b143c2bef6")} <span aria-hidden="true">↗</span></Link>}
          <Link to="/categories">{t("m_07a223d350")} <span aria-hidden="true">↗</span></Link>
          <Link to="/tags">{t("m_f298470746")} <span aria-hidden="true">↗</span></Link>
        </div>
      </nav>
      <section className="articles-list" aria-label={t("m_62e223f320")}>
        <PostResults path="/posts" />
      </section>
    </SitePage>
  );
}
