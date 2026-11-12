import { useI18n } from '../i18n';
import { useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';
import { dismissFeedback } from '../lib/feedback';

export function FeedbackToast({ id, kind, message, shake, version }: { id: string; kind: 'success' | 'error'; message: string; shake?: number; version: number }) {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const previousVersion = useRef(version);
  useEffect(() => {
    const repeated = previousVersion.current !== version;
    previousVersion.current = version;
    if (!repeated || !shake || document.documentElement.dataset.reducedMotion === 'true' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = root.current;
    if (!el) return;
    el.getAnimations().forEach(animation => {
      if (animation.id === 'feedback-shake-repeat' || ('animationName' in animation && ['feedback-enter', 'feedback-shake'].includes(String(animation.animationName)))) animation.cancel();
    });
    const animation = el.animate([{ transform:'translateX(0)' },{ transform:'translateX(-4px)' },{ transform:'translateX(4px)' },{ transform:'translateX(-4px)' },{ transform:'translateX(0)' }], { duration: shake === 1 ? 300 : shake === 2 ? 220 : 150, easing:'ease-in-out' });
    animation.id = 'feedback-shake-repeat';
  }, [version, shake]);
  useEffect(() => {
    const el = root.current!;
    let remaining = kind === 'success' ? 3000 : 6000, started = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hover = el.matches(':hover'), focus = el.contains(document.activeElement);
    const countdown = el.getAnimations({subtree:true}).find(animation => 'animationName' in animation && animation.animationName === 'feedback-countdown');
    if (countdown) countdown.currentTime = 0;
    const pause = () => { if (timer !== undefined) { clearTimeout(timer); remaining -= performance.now() - started; timer = undefined; } };
    const update = () => { pause(); const paused = hover || focus || document.hidden; el.dataset.paused = String(paused); if (!paused) { started = performance.now(); timer = setTimeout(() => dismissFeedback(id, version), Math.max(0, remaining)); } };
    const enter = () => { hover = true; update(); }, leave = () => { hover = false; update(); };
    const focusIn = () => { focus = true; update(); };
    const focusOut = (event: FocusEvent) => { focus = el.contains(event.relatedTarget as Node); update(); };
    el.addEventListener('pointerenter', enter); el.addEventListener('pointerleave', leave);
    el.addEventListener('focusin', focusIn); el.addEventListener('focusout', focusOut);
    document.addEventListener('visibilitychange', update); update();
    return () => { pause(); el.removeEventListener('pointerenter', enter); el.removeEventListener('pointerleave', leave); el.removeEventListener('focusin', focusIn); el.removeEventListener('focusout', focusOut); document.removeEventListener('visibilitychange', update); };
  }, [id, kind, version]);
  return <div ref={root} className={`feedback-toast feedback-toast--${kind}`} data-feedback-toast data-shake={shake}>
    <span className="feedback-symbol" aria-hidden="true">{kind === 'success' ? <Check size={12} strokeWidth={2.5}/> : <X size={12} strokeWidth={2.5}/>}</span>
    <span role={kind === 'error' ? 'alert' : 'status'} aria-atomic="true">{t(message || '')}</span>
    <button type="button" aria-label={t("m_d301bc1258")} onClick={() => dismissFeedback(id)}><X size={16}/></button>
  </div>;
}
