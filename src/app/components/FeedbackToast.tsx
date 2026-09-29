import { useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';
import { dismissFeedback } from '../lib/feedback';

export function FeedbackToast({ id, kind, message }: { id: string; kind: 'success' | 'error'; message: string }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current!;
    let remaining = kind === 'success' ? 3000 : 6000, started = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hover = false, focus = false;
    const pause = () => { if (timer !== undefined) { clearTimeout(timer); remaining -= performance.now() - started; timer = undefined; } };
    const update = () => { pause(); if (!hover && !focus && !document.hidden) { started = performance.now(); timer = setTimeout(() => dismissFeedback(id), Math.max(0, remaining)); } };
    const enter = () => { hover = true; update(); }, leave = () => { hover = false; update(); };
    const focusIn = () => { focus = true; update(); };
    const focusOut = (event: FocusEvent) => { focus = el.contains(event.relatedTarget as Node); update(); };
    el.addEventListener('pointerenter', enter); el.addEventListener('pointerleave', leave);
    el.addEventListener('focusin', focusIn); el.addEventListener('focusout', focusOut);
    document.addEventListener('visibilitychange', update); update();
    return () => { pause(); el.removeEventListener('pointerenter', enter); el.removeEventListener('pointerleave', leave); el.removeEventListener('focusin', focusIn); el.removeEventListener('focusout', focusOut); document.removeEventListener('visibilitychange', update); };
  }, [id, kind]);
  return <div ref={root} className={`feedback-toast feedback-toast--${kind}`} data-feedback-toast>
    <span className="feedback-symbol" aria-hidden="true">{kind === 'success' ? <Check size={18}/> : <X size={18}/>}</span>
    <span role={kind === 'error' ? 'alert' : 'status'} aria-atomic="true">{message}</span>
    <button type="button" aria-label="关闭提示" onClick={() => dismissFeedback(id)}><X size={16}/></button>
  </div>;
}
