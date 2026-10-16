import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { animate, motionValue } from 'motion';
import { motionDesign } from './motionDesign';
import { reducedMotion } from './motionPreference';

// One marker owns its position, so a new choice inherits both position and velocity.
export function useMovingIndicator(root: RefObject<HTMLElement | null>, value: unknown) {
  const [geometry] = useState(() => ({ x: motionValue(0), y: motionValue(0), width: motionValue(0), height: motionValue(0) }));
  const target = useRef({ x: 0, y: 0, width: 0, height: 0 }), ready = useRef(false);
  const previousMarker = useRef<HTMLElement | null>(null);
  const layoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
  layoutEffect(() => {
    const group = root.current, marker = group?.querySelector<HTMLElement>('[data-selection-indicator]');
    if (!group || !marker) return;
    if (previousMarker.current !== marker) { previousMarker.current = marker; ready.current = false; }
    const filled = marker.hasAttribute('data-selection-fill');
    let choices: { element: HTMLElement; x: number; y: number; width: number; height: number }[] = [];
    const draw = () => {
      const x = geometry.x.get(), y = geometry.y.get(), width = geometry.width.get(), height = geometry.height.get();
      marker.style.transform = filled ? `translate(${x}px,${y}px)` : `translateX(${x}px)`; marker.style.width = `${width}px`;
      if (filled) marker.style.height = `${height}px`;
      if (marker.hasAttribute('data-selection-inverse')) choices.forEach(choice => {
        // Clip inverse ink to the same moving rectangle, including partial glyphs.
        const left = x - choice.x, top = y - choice.y;
        choice.element.style.setProperty('--selection-clip', `inset(${top}px ${choice.width - left - width}px ${choice.height - top - height}px ${left}px round var(--selection-radius,10px))`);
      });
    };
    const unlisten = Object.values(geometry).map(value => value.on('change', draw));
    const place = () => {
      const selected = group.querySelector<HTMLElement>('[aria-pressed="true"],[aria-checked="true"],[aria-current="page"]');
      if (!selected || selected.matches(':disabled')) { group.dataset.indicatorReady = 'false'; ready.current = false; return; }
      const parent = group.getBoundingClientRect();
      const left = parent.left + (group.clientLeft || 0) - group.scrollLeft, top = parent.top + (group.clientTop || 0) - (group.scrollTop || 0);
      const layout = (element: HTMLElement) => {
        if (element.offsetParent === group) return { x: element.offsetLeft, y: element.offsetTop, width: element.offsetWidth, height: element.offsetHeight };
        const rect = element.getBoundingClientRect(); return { x: rect.left - left, y: rect.top - top, width: rect.width, height: rect.height };
      };
      choices = Array.from(group.querySelectorAll<HTMLElement>('button')).map(element => { const rect = layout(element); return { element, x: rect.x + element.clientLeft, y: rect.y + element.clientTop, width: element.clientWidth, height: element.clientHeight }; });
      const box = layout(selected), next = { x: box.x, y: filled ? box.y : 0, width: box.width, height: filled ? box.height : 0 };
      if (ready.current && Object.keys(next).every(key => next[key as keyof typeof next] === target.current[key as keyof typeof next])) return;
      target.current = next;
      for (const key of Object.keys(geometry) as (keyof typeof geometry)[]) {
        if (!ready.current || reducedMotion()) geometry[key].jump(next[key]);
        else animate(geometry[key], next[key], motionDesign.selectionSpring);
      }
      ready.current = true; group.dataset.indicatorReady = 'true'; draw();
    };
    const settle = () => { if (reducedMotion()) (Object.keys(geometry) as (keyof typeof geometry)[]).forEach(key => geometry[key].jump(target.current[key])); };
    place();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    observer?.observe(group); group.querySelectorAll('button').forEach(button => observer?.observe(button));
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    media.addEventListener('change', settle); window.addEventListener('mooncci:motion-change', settle);
    return () => { observer?.disconnect(); unlisten.forEach(stop => stop()); media.removeEventListener('change', settle); window.removeEventListener('mooncci:motion-change', settle); };
  }, [value]);
  useEffect(() => () => { Object.values(geometry).forEach(value => value.stop()); }, []);
}
