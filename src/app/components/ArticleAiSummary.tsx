import { useI18n } from '../i18n';
import {useEffect, useId, useRef, useState} from 'react';
import '../../styles/article-ai-summary.css';

export function ArticleAiSummary({summary}: {summary: string}) {
  const { t } = useI18n();
  const id = useId();
  const body = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const element = body.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const lines = Number(style.getPropertyValue('--ai-summary-lines'));
      setOverflow(element.scrollHeight > parseFloat(style.lineHeight) * lines + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [summary]);
  return <section className="article-ai-summary" aria-label={t("m_19278ef06b")}>
    <div className="article-ai-summary-header">
      <span className="article-ai-summary-icon" aria-hidden="true"/>
      <span className="article-ai-summary-title">{t("m_19278ef06b")}</span>
      <span className="article-ai-summary-provider"><span>{t("m_708712e581")} </span>DeepSeek<span>  {t("m_1ad1463fe1")}</span></span>
      <span className="article-ai-summary-spacer"/>
      {overflow && <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>{expanded ? t("m_afd4b78353") : t("m_00bd3960fe")}</button>}
    </div>
    <div id={id} ref={body} className="article-ai-summary-body" data-expanded={expanded}>{summary}</div>
    <p className="article-ai-summary-note">{t("m_08051d0a6b")}</p>
  </section>;
}
