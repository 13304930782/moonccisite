import {isRichText} from '../lib/richText';
import { lazy, Suspense, useState, useRef, useEffect, useCallback } from 'react';
import { MarkdownContent } from './MarkdownContent';
import {ArticleImageMenu} from './admin/ArticleImageMenu';
import '../../styles/article-editor.css';
const VisualMarkdownEditor = lazy(() => import('./VisualMarkdownEditor'));
export type ArticleEditorMode='visual'|'source'|'preview';
export function ArticleEditor({
  value,
  onChange,
  existing,
  uploadImage,
  onError,
  onBusy,
  registerImageInsert,
  mode:controlledMode,
  onModeChange,
  hideModeControls=false,
  onMediaLibrary,
  disabled=false,
  writingToolbar=false,
}: {
  value: string;
  onChange: (value: string) => void;
  existing: boolean;
  uploadImage: (file: File) => Promise<string>;
  onError: (message: string) => void;
  onBusy: (busy: boolean) => void;
  registerImageInsert?: (insert:(url:string,alt:string)=>void)=>void;
  mode?:ArticleEditorMode;
  onModeChange?:(mode:ArticleEditorMode)=>void;
  hideModeControls?:boolean;
  onMediaLibrary?:()=>void;
  disabled?:boolean;
  writingToolbar?:boolean;
}) {
  const [localMode,setLocalMode]=useState<ArticleEditorMode>(existing && !isRichText(value) ? 'source' : 'visual');
  const [visualReady,setVisualReady]=useState(false),[visualBusy,setVisualBusy]=useState(false),[imageBusy,setImageBusy]=useState(false);
  const requestedMode=controlledMode??localMode,mode=requestedMode==='source'&&isRichText(value)?'visual':requestedMode;
  const [visualStarted,setVisualStarted]=useState(mode==='visual');
  const visualValue=useRef(value);
  if(mode==='visual')visualValue.current=value;
  const setMode=useCallback((next:ArticleEditorMode)=>{if(visualBusy||imageBusy)return;if(controlledMode===undefined)setLocalMode(next);onModeChange?.(next);},[controlledMode,onModeChange,visualBusy,imageBusy]);
  useEffect(()=>{if(mode!==requestedMode)setMode(mode)},[mode,requestedMode,setMode]);
  const source=useRef<HTMLTextAreaElement>(null), visual=useRef<((url:string,alt:string)=>void)|null>(null);
  useEffect(()=>{onBusy(visualBusy||imageBusy);},[visualBusy,imageBusy,onBusy]);
  useEffect(()=>()=>onBusy(false),[onBusy]);
  useEffect(()=>{if(mode==='visual')setVisualStarted(true);},[mode]);
  const registerVisual=useCallback((insert:(url:string,alt:string)=>void)=>{visual.current=insert;setVisualReady(true);},[]);
  const insertImage=useCallback((url:string,alt:string)=>{
    if(mode==='visual'&&visual.current){visual.current(url,alt);return;}
    if(isRichText(value) && visual.current){setMode('visual');visual.current(url,alt);return;}
    const escaped=alt.replace(/\\/g,'\\\\').replace(/\[/g,'\\[').replace(/\]/g,'\\]').replace(/[\r\n]/g,' ');
    const markdown=`![${escaped}](<${url.replace(/>/g,'%3E').replace(/</g,'%3C').replace(/\s/g,'%20')}>)`;
    const el=source.current,start=el?.selectionStart??value.length,end=el?.selectionEnd??value.length;
    onChange(value.slice(0,start)+markdown+value.slice(end));
    if(mode==='preview')setMode('source');
    requestAnimationFrame(()=>{source.current?.focus({preventScroll:true});source.current?.setSelectionRange(start+markdown.length,start+markdown.length);});
  },[mode,value,onChange,setMode]);
  useEffect(()=>{registerImageInsert?.(insertImage);},[insertImage,registerImageInsert]);
  const imageTools=onMediaLibrary?<ArticleImageMenu compact={writingToolbar} disabled={disabled||visualBusy||mode==='visual'&&!visualReady} onMediaLibrary={onMediaLibrary} uploadImage={uploadImage} onInsert={insertImage} onError={onError} onBusy={setImageBusy}/>:null;

  return (
    <div className="article-editor" data-image-tools={!!onMediaLibrary} data-mode={mode}>
      {!hideModeControls&&<div
        className="article-editor-tabs"
        role="group"
        aria-label="正文编辑模式"
      >
        {[
          ['visual', '富文本编辑'],
          ...(!isRichText(value) && (existing || mode==='source') ? [['source', 'Markdown 源码']] : []),
          ['preview', '阅读预览'],
        ].map(([key, title]) => (
          <button
            type="button"
            key={key}
            aria-pressed={mode === key}
            disabled={disabled||visualBusy||imageBusy}
            onClick={() => setMode(key as ArticleEditorMode)}
          >
            {title}
          </button>
        ))}
      </div>}
      {mode!=='visual'&&<p className="article-editor-hint">
        {mode === 'source'
            ? '源码会原样保留。已有文章默认在此编辑；特殊 HTML 或扩展语法建议继续使用源码模式。'
            : '使用与公开文章页相同的阅读排版。'}
      </p>}
      {imageTools&&(!writingToolbar||mode==='source')&&<div className={writingToolbar?'article-source-toolbar':'article-editor-image-row'} hidden={mode==='preview'}>{imageTools}</div>}
      {!isRichText(value) && (
        <textarea
          ref={source}
          hidden={mode!=='source'}
          aria-label="Markdown 正文"
          spellCheck={false}
          rows={22}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="开始写作"
        />
      )}
      {mode === 'preview' && (
        <div className="article-editor-preview">
          <MarkdownContent content={value || '还没有正文内容。'} />
        </div>
      )}
      {visualStarted&&<div hidden={mode!=='visual'}><Suspense
          fallback={<p className="quiet-state">正在加载可视化编辑器…</p>}
        >
          <VisualMarkdownEditor
            value={visualValue.current}
            onChange={onChange}
            uploadImage={uploadImage}
            onError={onError}
            onBusy={setVisualBusy}
            registerImageInsert={registerVisual}
            disabled={disabled}
            writingToolbar={writingToolbar?imageTools??<></>:undefined}
          />
        </Suspense></div>}
    </div>
  );
}
