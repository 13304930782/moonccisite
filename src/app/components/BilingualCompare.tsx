import { useEffect, useRef, type ComponentProps, type UIEvent } from 'react';
import { useI18n } from '../i18n';
import { ArticleEditor } from './ArticleEditor';
import { MarkdownContent } from './MarkdownContent';
import '../../styles/bilingual-compare.css';

type Props = {
  chineseTitle: string;
  chineseContent: string;
  englishTitle: string;
  englishContent: string;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  disabled?: boolean;
  sync: boolean;
  editorProps: Omit<ComponentProps<typeof ArticleEditor>, 'value' | 'onChange' | 'disabled'>;
};

export function BilingualCompare({ chineseTitle, chineseContent, englishTitle, englishContent, onTitleChange, onContentChange, disabled, editorProps, sync }: Props) {
  const { t } = useI18n();
  const source = useRef<HTMLDivElement>(null), target = useRef<HTMLDivElement>(null);
  const syncedPositions = useRef(new WeakMap<HTMLDivElement, number>());
  useEffect(() => { syncedPositions.current = new WeakMap(); }, [sync]);
  const scroll = (event: UIEvent<HTMLDivElement>, other: HTMLDivElement | null) => {
    const current = event.currentTarget, expected = syncedPositions.current.get(current);
    syncedPositions.current.delete(current);
    if (expected !== undefined && Math.abs(current.scrollTop - expected) < 1) return;
    if (!sync || !other) return;
    const available = current.scrollHeight - current.clientHeight, otherAvailable = other.scrollHeight - other.clientHeight;
    if (available <= 0 || otherAvailable <= 0) return;
    const position = (current.scrollTop / available) * otherAvailable;
    if (Math.abs(other.scrollTop - position) < 1) return;
    other.scrollTop = position;
    syncedPositions.current.set(other, other.scrollTop);
  };
  return <section className="bilingual-compare" aria-label={t('中英文对照')}>
    <div className="bilingual-compare-columns">
      <section className="bilingual-compare-column">
        <header><strong>{t('中文')}</strong><span>{t('只读参考')}</span></header>
        <div className="bilingual-compare-scroll" ref={source} onWheelCapture={event => syncedPositions.current.delete(event.currentTarget)} onPointerDownCapture={event => syncedPositions.current.delete(event.currentTarget)} onKeyDownCapture={event => syncedPositions.current.delete(event.currentTarget)} onTouchStartCapture={event => syncedPositions.current.delete(event.currentTarget)} onScroll={event => scroll(event, target.current)} tabIndex={0}>
          <h2>{chineseTitle}</h2><MarkdownContent content={chineseContent || ''} headingPrefix="compare-chinese" />
        </div>
      </section>
      <section className="bilingual-compare-column">
        <header><strong>English</strong><span>{t('English 正在编辑')}</span></header>
        <div className="bilingual-compare-scroll" ref={target} onWheelCapture={event => syncedPositions.current.delete(event.currentTarget)} onPointerDownCapture={event => syncedPositions.current.delete(event.currentTarget)} onKeyDownCapture={event => syncedPositions.current.delete(event.currentTarget)} onTouchStartCapture={event => syncedPositions.current.delete(event.currentTarget)} onScroll={event => scroll(event, source.current)}>
          <label className="bilingual-compare-title"><span className="sr-only">{t('英文标题')}</span><textarea id="article-compare-title" rows={1} maxLength={255} value={englishTitle} disabled={disabled} onChange={event => onTitleChange(event.target.value.replace(/[\r\n]+/g, ' '))} placeholder={t('英文标题')} /></label>
          <ArticleEditor {...editorProps} value={englishContent} onChange={onContentChange} disabled={disabled} />
        </div>
      </section>
    </div>
  </section>;
}
