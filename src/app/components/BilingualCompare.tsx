import { useRef, useState, type ComponentProps, type UIEvent } from 'react';
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
  editorProps: Omit<ComponentProps<typeof ArticleEditor>, 'value' | 'onChange' | 'disabled'>;
};

export function BilingualCompare({ chineseTitle, chineseContent, englishTitle, englishContent, onTitleChange, onContentChange, disabled, editorProps }: Props) {
  const { t } = useI18n();
  const [sync, setSync] = useState(true);
  const source = useRef<HTMLDivElement>(null), target = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const scroll = (event: UIEvent<HTMLDivElement>, other: HTMLDivElement | null) => {
    if (!sync || !other || syncing.current) return;
    const current = event.currentTarget, available = current.scrollHeight - current.clientHeight;
    syncing.current = true;
    other.scrollTop = available > 0 ? (current.scrollTop / available) * (other.scrollHeight - other.clientHeight) : 0;
    requestAnimationFrame(() => { syncing.current = false; });
  };
  return <section className="bilingual-compare" aria-label={t('中英文对照')}>
    <div className="bilingual-compare-options"><label><input type="checkbox" checked={sync} onChange={event => setSync(event.target.checked)} />{t('同步滚动')}</label></div>
    <div className="bilingual-compare-columns">
      <section className="bilingual-compare-column">
        <header><strong>{t('中文')}</strong><span>{t('只读参考')}</span></header>
        <div className="bilingual-compare-scroll" ref={source} onScroll={event => scroll(event, target.current)} tabIndex={0}>
          <h2>{chineseTitle}</h2><MarkdownContent content={chineseContent || ''} headingPrefix="compare-chinese" />
        </div>
      </section>
      <section className="bilingual-compare-column">
        <header><strong>English</strong><span>{t('English 正在编辑')}</span></header>
        <div className="bilingual-compare-scroll" ref={target} onScroll={event => scroll(event, source.current)}>
          <label className="bilingual-compare-title"><span className="sr-only">{t('英文标题')}</span><textarea id="article-compare-title" rows={1} maxLength={255} value={englishTitle} disabled={disabled} onChange={event => onTitleChange(event.target.value.replace(/[\r\n]+/g, ' '))} placeholder={t('英文标题')} /></label>
          <ArticleEditor {...editorProps} value={englishContent} onChange={onContentChange} disabled={disabled} />
        </div>
      </section>
    </div>
  </section>;
}
