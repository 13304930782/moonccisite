import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { animate } from 'motion';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { reducedMotion } from '../lib/motionPreference';
import { motionDesign } from '../lib/motionDesign';
import { anchoredImageZoom, fittedImage, imageBounds, imageClamp, imagePresentation, imageResistance, readImageIntrinsicWidth, visibleImageSource, type ImageFit, type ImagePose } from '../lib/imageMotion';
import '../../styles/article-image-preview.css';

type Image = { src: string; alt: string; source: HTMLImageElement };
type Gallery = { images: Image[]; index: number; openedAt: number; direction: number };
const PreviewContext = createContext<((image: HTMLImageElement) => void) | null>(null);

export function ArticleImagePreview({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [gallery, setGallery] = useState<Gallery | null>(null), [open, setOpen] = useState(false);
  const origin = useRef<HTMLImageElement | null>(null);
  const activeImage = useRef<HTMLImageElement | null>(null), presentation = useRef<(() => void) | null>(null);
  useEffect(() => () => presentation.current?.(), []);
  function show(image: HTMLImageElement) {
    const elements = Array.from(image.closest('.markdown-body')?.querySelectorAll<HTMLImageElement>('img[data-preview-image]') || []);
    const index = elements.indexOf(image);
    if (index < 0) return;
    if (!gallery || gallery.images[gallery.index].source !== image) presentation.current?.();
    origin.current = image;
    setGallery({ images: elements.map(node => ({ src: node.currentSrc || node.src, alt: node.alt, source: node })), index, openedAt: performance.now(), direction: 0 });
    setOpen(true);
  }
  function move(delta: number) {
    if (!gallery || gallery.index + delta < 0 || gallery.index + delta >= gallery.images.length) return;
    presentation.current?.();
    if (activeImage.current && !activeImage.current.classList.contains('is-pending')) presentation.current = imagePresentation(activeImage.current, null, true, delta);
    setGallery(current => current ? { ...current, index: Math.max(0, Math.min(current.images.length - 1, current.index + delta)), direction: delta } : current);
  }
  function changeOpen(value: boolean) {
    if (!value && gallery && activeImage.current && !activeImage.current.classList.contains('is-pending')) {
      presentation.current?.();
      const source = gallery.images[gallery.index].source;
      presentation.current = imagePresentation(activeImage.current, visibleImageSource(source) ? source : null, true);
    }
    setOpen(value);
  }
  return <PreviewContext.Provider value={enabled ? show : null}>
    {children}
    {enabled && gallery && <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="article-image-preview" data-motion-surface="image" aria-describedby="article-image-description" onCloseAutoFocus={event => { event.preventDefault(); if (origin.current?.isConnected) origin.current.focus({ preventScroll: true }); }} onKeyDown={event => {
        if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !(event.target instanceof Element && event.target.closest('.article-image-stage.is-zoomed'))) { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); }
      }}>
        <DialogTitle className="sr-only">文章图片预览</DialogTitle>
        <DialogDescription id="article-image-description" className="sr-only">使用左右方向键或左右滑动切图，按 Escape 关闭。</DialogDescription>
        <PreviewSlide key={`${gallery.index}:${gallery.openedAt}`} image={gallery.images[gallery.index]} direction={gallery.direction} activeImage={activeImage} onSwipe={move} />
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

function PreviewSlide({ image, direction, activeImage, onSwipe }: { image: Image; direction: number; activeImage: React.MutableRefObject<HTMLImageElement | null>; onSwipe: (delta: number) => void }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading'), [attempt, setAttempt] = useState(0), [zoomed, setZoomed] = useState(false);
  const element = useRef<HTMLImageElement | null>(null), stage = useRef<HTMLDivElement>(null), fit = useRef<ImageFit | null>(null), pose = useRef<ImagePose>({ ...fittedImage }), intrinsicWidth = useRef(0);
  const transition = useRef<ReturnType<typeof animate> | null>(null), opening = useRef<(() => void) | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>()), gesture = useRef<{ x: number; y: number; pose: ImagePose; distance: number } | null>(null);
  const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
  function paint(value: ImagePose) {
    pose.current = value;
    if (element.current) element.current.style.transform = value.scale === 1 && value.x === 0 && value.y === 0 ? 'none' : `translate(${value.x}px, ${value.y}px) scale(${value.scale})`;
    if (stage.current) { stage.current.dataset.panX = String(value.x); stage.current.dataset.panY = String(value.y); stage.current.dataset.scale = String(value.scale); }
  }
  function stop() { transition.current?.stop(); transition.current = null; }
  function settle(target: ImagePose, spring = false) {
    stop();
    if (Math.abs(target.x - pose.current.x) + Math.abs(target.y - pose.current.y) + Math.abs(target.scale - pose.current.scale) < .001) { paint(target); return; }
    if (reducedMotion() || !element.current || typeof element.current.animate !== 'function') { paint(target); return; }
    const start = { ...pose.current };
    transition.current = animate(0, 1, { ...(spring ? motionDesign.imageSettle : motionDesign.content), onUpdate: progress => paint({ x: start.x + (target.x - start.x) * progress, y: start.y + (target.y - start.y) * progress, scale: start.scale + (target.scale - start.scale) * progress }), onComplete: () => paint(target) });
  }
  function zoom(point?: { x: number; y: number }, scale?: number, direct = false) {
    if (!fit.current || !stage.current) return;
    opening.current?.();
    const rect = stage.current.getBoundingClientRect(), anchor = point ? { x: point.x - (rect.left + rect.width / 2), y: point.y - (rect.top + rect.height / 2) } : { x: 0, y: 0 };
    const target = anchoredImageZoom(fit.current, pose.current, scale ?? (pose.current.scale > 1.01 ? 1 : fit.current.maxScale), anchor);
    setZoomed(target.scale > 1.01);
    if (direct) { stop(); paint(target); } else settle(target);
  }
  function readFit() {
    if (!element.current || !stage.current || !element.current.naturalWidth) return;
    stop(); paint({ ...fittedImage });
    const rect = element.current.getBoundingClientRect();
    if (!rect.width || !rect.height) { fit.current = null; return; }
    fit.current = { width: rect.width, height: rect.height, viewportWidth: stage.current.clientWidth, viewportHeight: stage.current.clientHeight, maxScale: Math.max(1, (intrinsicWidth.current || element.current.naturalWidth) / rect.width) };
    setZoomed(false);
  }
  useClientLayoutEffect(() => {
    if (status !== 'ready' || !element.current) return;
    readFit();
    const node = element.current;
    node.style.opacity = '0';
    opening.current = imagePresentation(node, direction === 0 && visibleImageSource(image.source) ? image.source : null, false, direction, () => { node.style.opacity = ''; });
    const resize = () => { opening.current?.(); readFit(); };
    const motionChange = () => { if (reducedMotion()) { stop(); const bounds = fit.current && imageBounds(fit.current, pose.current.scale); if (bounds) paint({ ...pose.current, x: imageClamp(pose.current.x, bounds.x), y: imageClamp(pose.current.y, bounds.y) }); } };
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    window.addEventListener('resize', resize); window.addEventListener('mooncci:motion-change', motionChange); media.addEventListener('change', motionChange);
    return () => { stop(); opening.current?.(); window.removeEventListener('resize', resize); window.removeEventListener('mooncci:motion-change', motionChange); media.removeEventListener('change', motionChange); };
  }, [status]);
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (status !== 'ready' || !fit.current) return;
      if (event.ctrlKey) { event.preventDefault(); zoom({ x: event.clientX, y: event.clientY }, pose.current.scale * Math.exp(-event.deltaY * .006), true); }
      else if (pose.current.scale > 1.01) {
        event.preventDefault(); stop(); const bounds = imageBounds(fit.current, pose.current.scale);
        paint({ ...pose.current, x: imageClamp(pose.current.x - event.deltaX, bounds.x), y: imageClamp(pose.current.y - event.deltaY, bounds.y) });
      }
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [status]);
  function beginGesture() {
    const points = [...pointers.current.values()], first = points[0], second = points[1];
    if (!first) { gesture.current = null; return; }
    gesture.current = { x: second ? (first.x + second.x) / 2 : first.x, y: second ? (first.y + second.y) / 2 : first.y, pose: { ...pose.current }, distance: second ? Math.hypot(first.x - second.x, first.y - second.y) : 0 };
  }
  function endPointer(event: React.PointerEvent<HTMLDivElement>, cancelled = false) {
    const start = gesture.current, points = pointers.current.size;
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    delete event.currentTarget.dataset.dragging;
    if (!cancelled && start && points === 1 && pose.current.scale <= 1.01) {
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.3) onSwipe(dx < 0 ? 1 : -1);
    }
    if (pointers.current.size) beginGesture();
    else {
      gesture.current = null;
      if (fit.current) { const bounds = imageBounds(fit.current, pose.current.scale); settle({ ...pose.current, x: imageClamp(pose.current.x, bounds.x), y: imageClamp(pose.current.y, bounds.y) }, true); }
    }
  }
  return <>
    <div ref={stage} className={`article-image-stage${zoomed ? ' is-zoomed' : ''}`} aria-busy={status === 'loading'} tabIndex={zoomed ? 0 : undefined} role={zoomed ? 'region' : undefined} aria-label={zoomed ? '放大图片，可拖动或使用方向键浏览' : undefined} onKeyDown={event => {
      if (!zoomed || !fit.current || !/^Arrow/.test(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const bounds = imageBounds(fit.current, pose.current.scale), delta = event.shiftKey ? 160 : 64;
      settle({ ...pose.current, x: imageClamp(pose.current.x + (event.key === 'ArrowLeft' ? delta : event.key === 'ArrowRight' ? -delta : 0), bounds.x), y: imageClamp(pose.current.y + (event.key === 'ArrowUp' ? delta : event.key === 'ArrowDown' ? -delta : 0), bounds.y) });
    }} onDoubleClick={event => { if (status === 'ready') zoom({ x: event.clientX, y: event.clientY }); }} onPointerDown={event => {
      if (status !== 'ready' || event.button !== 0) return;
      if (event.pointerType !== 'touch' && !zoomed) return;
      opening.current?.(); stop();
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); beginGesture();
      event.currentTarget.setPointerCapture(event.pointerId);
      if (zoomed) { event.currentTarget.dataset.dragging = 'true'; event.currentTarget.focus({ preventScroll: true }); }
      event.preventDefault();
    }} onPointerMove={event => {
      if (!pointers.current.has(event.pointerId) || !gesture.current || !fit.current || !stage.current) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const start = gesture.current, points = [...pointers.current.values()], first = points[0], second = points[1];
      const x = second ? (first.x + second.x) / 2 : first.x, y = second ? (first.y + second.y) / 2 : first.y;
      if (second && start.distance) {
        const rect = stage.current.getBoundingClientRect(), target = anchoredImageZoom(fit.current, start.pose, start.pose.scale * Math.hypot(first.x - second.x, first.y - second.y) / start.distance, { x: start.x - rect.left - rect.width / 2, y: start.y - rect.top - rect.height / 2 });
        const bounds = imageBounds(fit.current, target.scale);
        paint({ ...target, x: imageResistance(target.x + x - start.x, bounds.x), y: imageResistance(target.y + y - start.y, bounds.y) }); setZoomed(target.scale > 1.01);
      } else if (pose.current.scale > 1.01) {
        const bounds = imageBounds(fit.current, pose.current.scale);
        paint({ ...pose.current, x: imageResistance(start.pose.x + x - start.x, bounds.x), y: imageResistance(start.pose.y + y - start.y, bounds.y) });
      }
    }} onPointerUp={event => endPointer(event)} onPointerCancel={event => endPointer(event, true)} onLostPointerCapture={event => { if (pointers.current.has(event.pointerId)) endPointer(event, true); }}>
      {status === 'loading' && <p className="article-image-status" role="status">正在加载图片…</p>}
      {status === 'error' && <div className="article-image-status" role="alert"><p>图片加载失败</p><button type="button" className="quiet-button" onClick={() => { setStatus('loading'); setAttempt(value => value + 1); }}>重试</button></div>}
      <img key={attempt} ref={node => { element.current = node; activeImage.current = node; }} src={image.src} alt={image.alt} className={status === 'ready' ? '' : 'is-pending'} onLoad={event => { intrinsicWidth.current = readImageIntrinsicWidth(event.currentTarget); setStatus('ready'); }} onError={() => setStatus('error')} draggable={false}/>
    </div>
    <button type="button" className="quiet-button article-image-zoom" disabled={status !== 'ready'} aria-label={zoomed ? '适应窗口' : '查看原始尺寸'} aria-pressed={zoomed} onClick={() => zoom()}>{zoomed ? <ZoomOut size={18}/> : <ZoomIn size={18}/>}<span>{zoomed ? '适应窗口' : '原始尺寸'}</span></button>
  </>;
}
