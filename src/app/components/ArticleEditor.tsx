import { lazy, Suspense, useState, useRef, useEffect } from 'react';
import { MarkdownContent } from './MarkdownContent';
import '../../styles/article-editor.css';
const VisualMarkdownEditor = lazy(() => import('./VisualMarkdownEditor'));
export function ArticleEditor({
  value,
  onChange,
  existing,
  uploadImage,
  onError,
  onBusy,
  registerImageInsert,
}: {
  value: string;
  onChange: (value: string) => void;
  existing: boolean;
  uploadImage: (file: File) => Promise<string>;
  onError: (message: string) => void;
  onBusy: (busy: boolean) => void;
  registerImageInsert?: (insert:(url:string,alt:string)=>void)=>void;
}) {
  const [mode, setMode] = useState(existing ? 'source' : 'visual');
  const source=useRef<HTMLTextAreaElement>(null), visual=useRef<((url:string,alt:string)=>void)|null>(null);
  useEffect(()=>{registerImageInsert?.((url,alt)=>{
    if(mode==='visual'&&visual.current){visual.current(url,alt);return;}
    const escaped=alt.replace(/\\/g,'\\\\').replace(/\[/g,'\\[').replace(/\]/g,'\\]').replace(/[\r\n]/g,' ');
    const markdown=`![${escaped}](<${url.replace(/>/g,'%3E').replace(/</g,'%3C').replace(/\s/g,'%20')}>)`;
    const el=source.current,start=el?.selectionStart??value.length,end=el?.selectionEnd??value.length;
    onChange(value.slice(0,start)+markdown+value.slice(end));
  });},[mode,value,onChange,registerImageInsert]);

  return (
    <div className="article-editor">
      <div
        className="article-editor-tabs"
        role="group"
        aria-label="正文编辑模式"
      >
        {[
          ['visual', '可视化'],
          ['source', 'Markdown 源码'],
          ['preview', '阅读预览'],
        ].map(([key, title]) => (
          <button
            type="button"
            key={key}
            aria-pressed={mode === key}
            onClick={() => setMode(key)}
          >
            {title}
          </button>
        ))}
      </div>
      <p className="article-editor-hint">
        {mode === 'visual'
          ? '支持标题、列表、引用、表格、代码块和图片。正文仍以 Markdown 保存。'
          : mode === 'source'
            ? '源码会原样保留。已有文章默认在此编辑；特殊 HTML 或扩展语法建议继续使用源码模式。'
            : '使用与公开文章页相同的阅读排版。'}
      </p>
      {mode === 'source' ? (
        <textarea
          ref={source}
          aria-label="Markdown 正文"
          spellCheck={false}
          rows={22}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="用 Markdown 写下你的文章…"
        />
      ) : mode === 'preview' ? (
        <div className="article-editor-preview">
          <MarkdownContent content={value || '还没有正文内容。'} />
        </div>
      ) : (
        <Suspense
          fallback={<p className="quiet-state">正在加载可视化编辑器…</p>}
        >
          <VisualMarkdownEditor
            value={value}
            onChange={onChange}
            uploadImage={uploadImage}
            onError={onError}
            onBusy={onBusy}
            registerImageInsert={insert=>{visual.current=insert;}}
          />
        </Suspense>
      )}
    </div>
  );
}
