import { animate } from 'motion/mini';
import { reducedMotion } from './motionPreference';
import { motionDesign } from './motionDesign';

export type ImagePose = { x: number; y: number; scale: number };
export type ImageFit = { width: number; height: number; viewportWidth: number; viewportHeight: number; maxScale: number };
export const fittedImage: ImagePose = { x: 0, y: 0, scale: 1 };
// WebKit can report an SVG's constrained CSS width as naturalWidth. Measure the
// already-loaded node while still pending/hidden, then restore before painting.
export function readImageIntrinsicWidth(image: HTMLImageElement) {
  const { maxWidth, maxHeight } = image.style;
  try {
    image.style.maxWidth = 'none'; image.style.maxHeight = 'none';
    image.getBoundingClientRect();
    return image.naturalWidth;
  } finally { image.style.maxWidth = maxWidth; image.style.maxHeight = maxHeight; }
}
export function imageBounds(fit: ImageFit, scale: number) {
  return { x: Math.max(0, (fit.width * scale - fit.viewportWidth) / 2), y: Math.max(0, (fit.height * scale - fit.viewportHeight) / 2) };
}
export const imageClamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
// Within the image the pointer is 1:1; only the overscroll has resistance.
export function imageResistance(value: number, limit: number) {
  const edge = imageClamp(value, limit), excess = value - edge;
  return edge + excess / (1 + Math.abs(excess) / 72) * .35;
}
export function anchoredImageZoom(fit: ImageFit, pose: ImagePose, scale: number, point: { x: number; y: number }): ImagePose {
  scale = Math.max(1, Math.min(fit.maxScale, scale));
  const ratio = scale / pose.scale, bounds = imageBounds(fit, scale);
  return { scale, x: imageClamp(point.x - (point.x - pose.x) * ratio, bounds.x), y: imageClamp(point.y - (point.y - pose.y) * ratio, bounds.y) };
}

export function visibleImageSource(source: HTMLImageElement | null) {
  if (!source?.isConnected || !source.complete || !source.naturalWidth) return false;
  const rect = source.getBoundingClientRect();
  let left = Math.max(0, rect.left), top = Math.max(0, rect.top), right = Math.min(innerWidth, rect.right), bottom = Math.min(innerHeight, rect.bottom);
  for (let node = source.parentElement; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node), clip = node.getBoundingClientRect();
    if (style.overflowX !== 'visible') { left = Math.max(left, clip.left); right = Math.min(right, clip.right); }
    if (style.overflowY !== 'visible') { top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom); }
  }
  // Tall article images may legitimately extend beyond the viewport; a visible portion still anchors them.
  return rect.width > 0 && rect.height > 0 && Math.max(0, right - left) * Math.max(0, bottom - top) >= rect.width * rect.height * .15;
}

const presentations = new WeakMap<HTMLImageElement, { clone: HTMLImageElement; cancel: () => void }>();
const sourcePresentations = new WeakMap<HTMLImageElement, { clone: HTMLImageElement; cancel: () => void }>();
// The independent presentation layer never changes the real image or viewport geometry.
export function imagePresentation(image: HTMLImageElement, source: HTMLImageElement | null, exit = false, direction = 0, done?: () => void) {
  if (reducedMotion() || typeof image.animate !== 'function') { done?.(); return () => {}; }
  const previous = presentations.get(image) || (source ? sourcePresentations.get(source) : undefined);
  const imageRect = image.getBoundingClientRect(), previousRect = previous?.clone.getBoundingClientRect(), rect = exit ? previousRect || imageRect : imageRect;
  const previousStyle = previous && getComputedStyle(previous.clone), previousWidth = previous ? parseFloat(previous.clone.style.width) : 1;
  const physicalRadius = (previousStyle?.borderRadius || getComputedStyle(image).borderRadius).replace(/([\d.]+)px/g, (_, value) => `${Number(value) * (previousRect ? previousRect.width / previousWidth : 1)}px`);
  const previousCrop = previousStyle?.clipPath.replace(/([\d.]+)px/g, (_, value) => `${Number(value) * rect.width / previousWidth}px`), currentOpacity = Number(previousStyle?.opacity || 1);
  const target = exit ? source?.getBoundingClientRect() : previousRect || source?.getBoundingClientRect();
  const scale = target ? target.width / rect.width : 1;
  const sourceRadius = source ? getComputedStyle(source).borderRadius : '0px';
  const radius = (!exit && previous ? physicalRadius : sourceRadius).replace(/([\d.]+)px/g, (_, value) => `${Number(value) / scale}px`);
  const currentRadius = exit ? physicalRadius : getComputedStyle(image).borderRadius;
  previous?.cancel();
  if (!rect.width || !rect.height) { done?.(); return () => {}; }
  const clone = image.cloneNode() as HTMLImageElement;
  clone.removeAttribute('id'); clone.removeAttribute('class'); clone.removeAttribute('role'); clone.removeAttribute('tabindex');
  clone.alt = ''; clone.setAttribute('aria-hidden', 'true'); clone.dataset.motionPresentation = 'image';
  Object.assign(clone.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, maxWidth: 'none', maxHeight: 'none', margin: '0', zIndex: '110', pointerEvents: 'none', objectFit: 'fill', transformOrigin: '0 0', visibility: 'visible', transform: 'none', opacity: '1' });
  const sameRatio = target && Math.abs((target.width / target.height) / (rect.width / rect.height) - 1) < .02;
  const transform = sameRatio ? `translate(${target.left - rect.left}px, ${target.top - rect.top}px) scale(${target.width / rect.width})` : null;
  let animation: ReturnType<typeof animate> | undefined, stopped = false;
  const cleanup = () => { if (stopped) return; stopped = true; animation?.cancel(); clone.remove(); if (presentations.get(image)?.clone === clone) presentations.delete(image); if (source && sourcePresentations.get(source)?.clone === clone) sourcePresentations.delete(source); media.removeEventListener('change', changed); window.removeEventListener('mooncci:motion-change', changed); done?.(); };
  const changed = () => { if (reducedMotion()) cleanup(); };
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  document.body.append(clone);
  presentations.set(image, { clone, cancel: cleanup });
  if (source) sourcePresentations.set(source, { clone, cancel: cleanup });
  media.addEventListener('change', changed); window.addEventListener('mooncci:motion-change', changed);
  const viewport = image.closest('.article-image-stage')?.getBoundingClientRect();
  const crop = viewport ? `inset(${Math.max(0, viewport.top - rect.top)}px ${Math.max(0, rect.right - viewport.right)}px ${Math.max(0, rect.bottom - viewport.bottom)}px ${Math.max(0, viewport.left - rect.left)}px)` : 'inset(0px 0px 0px 0px)';
  try {
    animation = animate(clone, transform ? { transform: exit ? ['none', transform] : [transform, 'none'], clipPath: exit ? [previousCrop || crop, 'inset(0px 0px 0px 0px)'] : [previousCrop || 'inset(0px 0px 0px 0px)', crop], borderRadius: exit ? [currentRadius, radius] : [radius, currentRadius], opacity: exit ? [currentOpacity, 1] : [previous ? currentOpacity : 1, 1] } : { transform: exit ? ['translateX(0px)', `translateX(${-direction * 22}px)`] : [`translateX(${direction * 22}px)`, 'translateX(0px)'], opacity: exit ? [currentOpacity, 0] : [previous ? currentOpacity : 0, 1], clipPath: [previousCrop || crop, previousCrop || crop], borderRadius: [currentRadius, currentRadius] }, exit ? motionDesign.imageExit : motionDesign.imageEnter);
    animation.then(cleanup, cleanup);
  } catch { cleanup(); }
  return cleanup;
}
