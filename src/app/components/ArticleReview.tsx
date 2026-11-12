import { useI18n } from '../i18n';
import { stripLegacyAgeNotice } from '../lib/articleAge';
import { ThemeSelect } from './ThemeSelect';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArticlePresentation } from './ArticlePresentation';
import { EmbeddedPlayback } from './RichTextContent';

const srcDoc = '<!doctype html><html lang="zh-CN"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="preview-root" class="neo-page"></div></body></html>';
export function ArticleReview({ post, onPublish, busy, disabled = false, publishLabel = '确认发布' }: { post: any; onPublish: () => void; busy: boolean; disabled?: boolean; publishLabel?: string }) {
  const { t } = useI18n();
  const description = stripLegacyAgeNotice(post.summary).trim();
  const [previewFailed, setPreviewFailed] = useState(false), [previewAttempt, setPreviewAttempt] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<HTMLElement | null>(null), [width, setWidth] = useState(375);
  const [availableWidth, setAvailableWidth] = useState(0);
  const scale = availableWidth > 0 ? Math.min(1, availableWidth / width) : 1;
  const snapshot = JSON.stringify(post);
  const preview = useMemo(() => <ArticlePresentation preview post={post} />, [snapshot]);
  const ready = useCallback(() => {
    const doc = frame.current?.contentDocument, element = doc?.getElementById('preview-root');
    if (!doc || !element) return;
    if (!doc.head.querySelector('[data-article-preview-styles]')) {
      for (const el of Array.from(document.querySelectorAll('link[rel="stylesheet"],style'))) {
        const copy = el.cloneNode(true) as HTMLElement;
        if (copy instanceof HTMLLinkElement) copy.href = (el as HTMLLinkElement).href;
        doc.head.appendChild(copy);
      }
      const style = doc.createElement('style');
      style.dataset.articlePreviewStyles = '';
      style.textContent = 'html{scrollbar-gutter:auto}body{margin:0}.detail-preview{max-width:none;margin:auto}';
      doc.head.appendChild(style);
    }
    doc.documentElement.classList.toggle('dark', document.documentElement.classList.contains('dark'));
    setRoot(element);
  }, []);
  useEffect(() => {
    if (root) return;
    ready();
    const timer = window.setInterval(ready, 100);
    const timeout = window.setTimeout(() => { window.clearInterval(timer); setPreviewFailed(true); }, 10000);
    return () => { window.clearInterval(timer); window.clearTimeout(timeout); };
  }, [ready, root, previewAttempt]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const update = () => setAvailableWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <section className="article-review">
    <section className="article-review-result"><div><h2>{t("m_5c78e4b3a7")}</h2><strong>{post.title} · mooncci</strong><p>{description || t("m_adf90cb6e3")}</p><small>{Array.from(description).length} {t("m_1afabfd4e4")} {post.summary_mode === 'ai' ? t("m_2b376005fd") : t("m_81bd24af45")} {t("m_b83e9789dc")}</small></div></section>
    <div className="article-review-toolbar"><label>{t("m_cb1783cd73")}<ThemeSelect aria-label={t("m_cb1783cd73")} value={String(width)} onValueChange={v => setWidth(Number(v))}><option value="375">{t("m_7fd6ae67f4")}</option><option value="768">{t("m_ab76612c10")}</option><option value="1024">{t("m_14a022bbbd")}</option></ThemeSelect></label></div>
    <div className="article-preview-label"><h2>{t("m_255536cdc5")}</h2><p>{t("m_0b251f0ddf")}</p></div>
    {previewFailed && !root && <div role="alert" className="article-review-result"><div><p>{t('文章预览未能加载，请重试。')}</p><button type="button" className="article-button" onClick={() => { setPreviewFailed(false); setPreviewAttempt(value => value + 1); }}>{t("m_2b4d78b18e")}</button></div></div>}
    <div className="article-review-scroll" ref={viewport}><div className="article-review-stage" style={{ width: width * scale, height: 620 * scale }}><iframe key={previewAttempt} title={t("m_9605a825d8")} ref={frame} srcDoc={srcDoc} sandbox="allow-same-origin" onLoad={ready} style={{ width, height: 620, transform: `scale(${scale})` }} /></div>{root && createPortal(<EmbeddedPlayback.Provider value={false}>{preview}</EmbeddedPlayback.Provider>, root)}</div>
    <div className="article-review-footer"><button type="button" className="article-review-publish article-button article-button-primary" disabled={disabled || busy} onClick={onPublish}>{busy ? t("m_6bdb443509") : publishLabel}</button></div>
  </section>;
}
