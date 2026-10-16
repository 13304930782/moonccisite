import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { feedbackMotion } from '../lib/feedbackMotion';
import '../../styles/article-image-preview.css';

type Image = { src: string; alt: string };
type Gallery = { images: Image[]; index: number; source: DOMRect | null; openedAt: number };
const PreviewContext = createContext<((image: HTMLImageElement) => void) | null>(null);

export function ArticleImagePreview({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [gallery, setGallery] = useState<Gallery | null>(null), [open, setOpen] = useState(false);
  const origin = useRef<HTMLImageElement | null>(null);
  function show(image: HTMLImageElement) {
    const elements = Array.from(image.closest('.markdown-body')?.querySelectorAll<HTMLImageElement>('img[data-preview-image]') || []);
    const index = elements.indexOf(image);
    if (index < 0) return;
    origin.current = image;
    setGallery({ images: elements.map(node => ({ src: node.currentSrc || node.src, alt: node.alt })), index, source: image.getBoundingClientRect(), openedAt: performance.now() });
    setOpen(true);
  }
  function move(delta: number) {
    setGallery(current => current ? { ...current, index: Math.max(0, Math.min(current.images.length - 1, current.index + delta)), source: null } : current);
  }
  return <PreviewContext.Provider value={enabled ? show : null}>
    {children}
    {enabled && gallery && <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="article-image-preview" aria-describedby="article-image-description" onCloseAutoFocus={event => { event.preventDefault(); if (origin.current?.isConnected) origin.current.focus({ preventScroll: true }); }} onKeyDown={event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); }
      }}>
        <DialogTitle className="sr-only">文章图片预览</DialogTitle>
        <DialogDescription id="article-image-description" className="sr-only">使用左右方向键或左右滑动切图，按 Escape 关闭。</DialogDescription>
        <PreviewSlide key={`${gallery.index}:${gallery.openedAt}`} image={gallery.images[gallery.index]} source={gallery.source} openedAt={gallery.openedAt} onSwipe={move} />
        <div className="article-image-navigation">
          <button type="button" className="quiet-button" aria-label="上一张图片" disabled={gallery.index === 0} onClick={() => move(-1)}><ChevronLeft size={20}/></button>
          <span role="status" aria-live="polite">{gallery.index + 1} / {gallery.images.length}</span>
          <button type="button" className="quiet-button" aria-label="下一张图片" disabled={gallery.index === gallery.images.length - 1} onClick={() => move(1)}><ChevronRight size={20}/></button>
        </div>
      </DialogContent>
    </Dialog>}
  </PreviewContext.Provider>;
}

export function PreviewImage(props: ImgHTMLAttributes<HTMLImageElement>) {
  const show = useContext(PreviewContext);
  if (!show) return <img {...props}/>;
  return <img {...props} data-preview-image role="button" tabIndex={0} aria-label={`放大图片：${props.alt || '文章图片'}`} onClick={event => show(event.currentTarget)} onKeyDown={event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(event.currentTarget); }
  }}/>;
}

// Linked pictures keep their original destination and keyboard semantics.
export function LinkedImages({ children }: { children: ReactNode }) {
  return <PreviewContext.Provider value={null}>{children}</PreviewContext.Provider>;
}

function PreviewSlide({ image, source, openedAt, onSwipe }: { image: Image; source: DOMRect | null; openedAt: number; onSwipe: (delta: number) => void }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading'), [attempt, setAttempt] = useState(0), [zoomed, setZoomed] = useState(false);
  const element = useRef<HTMLImageElement>(null), touch = useRef<{ id: number; x: number; y: number } | null>(null);
  const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
  useClientLayoutEffect(() => {
    if (status !== 'ready' || !element.current || zoomed) return;
    const imageElement = element.current, target = imageElement.getBoundingClientRect();
    const from = source && source.bottom > 0 && source.top < innerHeight && performance.now() - openedAt < 600 && target.width && target.height
      ? `translate(${source.x + source.width / 2 - target.x - target.width / 2}px, ${source.y + source.height / 2 - target.y - target.height / 2}px) scale(${source.width / target.width}, ${source.height / target.height})`
      : 'translateY(4px)';
    return feedbackMotion(imageElement, { opacity: [0, 1], transform: [from, 'none'] });
  }, [status, source, openedAt, zoomed]);
  return <>
    <div className={`article-image-stage${zoomed ? ' is-zoomed' : ''}`} aria-busy={status === 'loading'} onTouchStart={event => {
      const first = event.touches[0]; touch.current = !zoomed && event.touches.length === 1 ? { id: first.identifier, x: first.clientX, y: first.clientY } : null;
    }} onTouchMove={event => { if (event.touches.length !== 1) touch.current = null; }} onTouchCancel={() => { touch.current = null; }} onTouchEnd={event => {
      const start = touch.current; touch.current = null;
      const end = Array.from(event.changedTouches).find(item => item.identifier === start?.id);
      if (!start || !end || event.touches.length || zoomed) return;
      const dx = end.clientX - start.x, dy = end.clientY - start.y;
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.3) onSwipe(dx < 0 ? 1 : -1);
    }}>
      {status === 'loading' && <p className="article-image-status" role="status">正在加载图片…</p>}
      {status === 'error' && <div className="article-image-status" role="alert"><p>图片加载失败</p><button type="button" className="quiet-button" onClick={() => { setStatus('loading'); setAttempt(value => value + 1); }}>重试</button></div>}
      <img key={attempt} ref={element} src={image.src} alt={image.alt} className={status === 'ready' ? '' : 'is-pending'} onLoad={() => setStatus('ready')} onError={() => setStatus('error')} draggable={false}/>
    </div>
    <button type="button" className="quiet-button article-image-zoom" disabled={status !== 'ready'} aria-label={zoomed ? '适应窗口' : '查看原始尺寸'} aria-pressed={zoomed} onClick={() => setZoomed(value => !value)}>{zoomed ? <ZoomOut size={18}/> : <ZoomIn size={18}/>}<span>{zoomed ? '适应窗口' : '原始尺寸'}</span></button>
  </>;
}
