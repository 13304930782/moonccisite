import { useEffect, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { animate, motionValue } from 'motion';
import { motionDesign } from '../lib/motionDesign';
import { reducedMotion } from '../lib/motionPreference';
import '../../styles/selection-fold.css';

// Height changes move neighbouring content; text itself is never scaled.
export function MotionDisclosure({ open, children, ...props }: HTMLAttributes<HTMLDivElement> & { open: boolean; children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const [present, setPresent] = useState(open);
  const [height] = useState(() => motionValue(0)), [opacity] = useState(() => motionValue(open ? 1 : 0));
  const latestOpen = useRef(open), initialized = useRef(false), naturalHeight = useRef(0), generation = useRef(0);
  latestOpen.current = open;
  const layoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
  layoutEffect(() => {
    const outer = frame.current, inner = content.current;
    if (!outer || !inner) return;
    outer.inert = !open;
    const drawHeight = () => { outer.style.height = `${Math.max(0, height.get())}px`; };
    const drawOpacity = () => { inner.style.opacity = String(opacity.get()); };
    const unlisten = [height.on('change', drawHeight), opacity.on('change', drawOpacity)];
    const settle = () => {
      generation.current++; height.jump(open ? naturalHeight.current : 0); opacity.jump(open ? 1 : 0);
      outer.style.height = open ? 'auto' : '0px'; outer.dataset.moving = 'false';
      if (!open) setPresent(false);
    };
    const move = () => {
      naturalHeight.current = inner.getBoundingClientRect().height;
      if (!initialized.current) {
        initialized.current = true;
        if (open) { height.jump(naturalHeight.current); outer.style.height = 'auto'; opacity.jump(1); return; }
      }
      if (reducedMotion() || typeof outer.animate !== 'function') { settle(); return; }
      const version = ++generation.current, next = open ? naturalHeight.current : 0;
      outer.dataset.moving = 'true';
      drawHeight();
      animate(opacity, open ? 1 : 0, motionDesign.opacity);
      animate(height, next, motionDesign.disclosureSpring).then(() => {
        if (version !== generation.current || latestOpen.current !== open) return;
        outer.style.height = open ? 'auto' : '0px'; outer.dataset.moving = 'false';
        if (!open) setPresent(false);
      });
    };
    if (open) setPresent(true);
    move();
    const owner = outer.ownerDocument?.defaultView || window;
    let resizeFrame: number | undefined;
    const resize = () => {
      resizeFrame = undefined;
      const measured = inner.getBoundingClientRect().height;
      if (open && Math.abs(measured - naturalHeight.current) > .5) {
        // A settled parent follows an already animated child without a second spring.
        if (outer.style.height === 'auto' && inner.querySelector?.('.motion-disclosure[data-moving="true"]')) {
          naturalHeight.current = measured; settle();
        } else move();
      }
    };
    // Size writes during observer delivery can trigger a same-frame loop in WebKit.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (resizeFrame === undefined) resizeFrame = owner.requestAnimationFrame(resize);
    }); observer?.observe(inner);
    const reduce = () => { if (reducedMotion()) settle(); };
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    media.addEventListener('change', reduce); window.addEventListener('mooncci:motion-change', reduce);
    return () => { observer?.disconnect(); if (resizeFrame !== undefined) owner.cancelAnimationFrame(resizeFrame); unlisten.forEach(stop => stop()); media.removeEventListener('change', reduce); window.removeEventListener('mooncci:motion-change', reduce); };
  }, [open, open || present]);
  useEffect(() => () => { generation.current++; height.stop(); opacity.stop(); }, []);
  return <div {...props} ref={frame} className={`motion-disclosure ${props.className || ''}`} hidden={!open && !present} aria-hidden={!open}>
    <div ref={content} className="motion-disclosure-content">{(open || present) && children}</div>
  </div>;
}

export function MotionChevron({ open, children = '▾' }: { open: boolean; children?: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [angle] = useState(() => motionValue(open ? 180 : 0));
  const layoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
  layoutEffect(() => {
    const draw = () => { if (ref.current) ref.current.style.rotate = `${angle.get()}deg`; };
    const stop = angle.on('change', draw);
    const settle = () => { if (reducedMotion()) angle.jump(open ? 180 : 0); };
    if (reducedMotion()) angle.jump(open ? 180 : 0);
    else animate(angle, open ? 180 : 0, motionDesign.disclosureSpring);
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    media.addEventListener('change', settle); window.addEventListener('mooncci:motion-change', settle);
    return () => { stop(); media.removeEventListener('change', settle); window.removeEventListener('mooncci:motion-change', settle); };
  }, [open]);
  useEffect(() => () => angle.stop(), []);
  return <span ref={ref} className="motion-chevron" aria-hidden="true">{children}</span>;
}
