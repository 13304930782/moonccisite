import { useI18n } from '../i18n';
import '../../styles/article-loading.css';

// Unknown cover metadata must never create a large speculative image placeholder.
export function ArticleLoading() {
  const {t} = useI18n();
  return <div className="article-loading" role="status" aria-busy="true" aria-label={t('m_aaca7d941e')}>
    <div aria-hidden="true" className="article-loading-heading"><span className="article-loading-back"/><span className="article-loading-title"/><span className="article-loading-title article-loading-short"/><span className="article-loading-meta"/></div>
    <div aria-hidden="true" className="article-loading-body">{Array.from({length:9},(_,i)=><span key={i}/>)}</div>
    <span className="sr-only">{t('m_2b1fde913d')}</span>
  </div>;
}
