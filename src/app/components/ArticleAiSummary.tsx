import {useEffect, useId, useRef, useState} from 'react';
import '../../styles/article-ai-summary.css';

export function ArticleAiSummary({summary}: {summary: string}) {
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
  return <section className="article-ai-summary" aria-label="AI 简介">
    <div className="article-ai-summary-header">
      <span className="article-ai-summary-title">AI 简介</span>
      <span className="article-ai-summary-icon" aria-hidden="true"/>
      <span className="article-ai-summary-provider"><span>由 </span>DeepSeek<span> 生成</span></span>
      <span className="article-ai-summary-spacer"/>
      {overflow && <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>{expanded ? '收起' : '展开'}</button>}
    </div>
    <div id={id} ref={body} className="article-ai-summary-body" data-expanded={expanded}>{summary}</div>
    <p className="article-ai-summary-note">AI 生成内容可能有误，请以正文为准。</p>
  </section>;
}
