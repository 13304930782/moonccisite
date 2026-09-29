import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { Toaster } from './ui/sonner';
import { feedbackStore, dismissOutsideFeedback } from '../lib/feedback';
import { confirmationStore, finishConfirmation } from '../lib/confirmAction';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogCancel, AlertDialogAction, AlertDialogFooter } from './ui/alert-dialog';
import { toast } from 'sonner';
import { FeedbackToast } from './FeedbackToast';

export function FeedbackHost() {
  const location = useLocation();
  const messages = useSyncExternalStore(feedbackStore.subscribe, feedbackStore.getSnapshot);
  const displayed = useRef(new Map<string, number>());
  useEffect(() => {
    for (const id of displayed.current.keys()) if (!messages.some(item => item.id === id)) toast.dismiss(id);
    for (const item of messages) if (displayed.current.get(item.id) !== item.version) {
      toast.custom(() => <FeedbackToast key={`${item.id}:${item.version}`} {...item}/>, { id: item.id, duration: Infinity });
    }
    displayed.current = new Map(messages.map(item => [item.id, item.version]));
  }, [messages]);
  const [top, setTop] = useState(88);
  const request = useSyncExternalStore(confirmationStore.subscribe, confirmationStore.getSnapshot);
  const trigger = useRef<HTMLElement | null>(null);
  if (request) trigger.current = request.trigger;
  useEffect(() => {
    const outside = (event: MouseEvent) => { if (!(event.target instanceof Element) || !event.target.closest('[data-sonner-toaster]')) dismissOutsideFeedback(); };
    document.addEventListener('click', outside, true);
    return () => document.removeEventListener('click', outside, true);
  }, []);
  useEffect(() => {
    const measure = () => {
      const bars = document.querySelectorAll('.site-header, .account-topbar, .admin-mobile-bar');
      let bottom = 0;
      bars.forEach(bar => { const r = bar.getBoundingClientRect(); if (r.width && r.top <= 1 && r.bottom > 0) bottom = Math.max(bottom, Math.min(r.bottom, 180)); });
      setTop(bottom + 12);
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(document.body);
    const mounts = new MutationObserver(measure); mounts.observe(document.body, { childList:true, subtree:true });
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, { passive: true });
    return () => { mounts.disconnect(); observer.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure); };
  }, [location.pathname]);
  return <>
    <Toaster position="top-right" visibleToasts={2} expand offset={{ top: `max(${top}px, env(safe-area-inset-top))`, left: 'max(16px, env(safe-area-inset-left))', right: 'max(16px, env(safe-area-inset-right))' }} mobileOffset={{ top: `max(${top}px, env(safe-area-inset-top))`, left: 'max(16px, env(safe-area-inset-left))', right: 'max(16px, env(safe-area-inset-right))' }} containerAriaLabel="操作提示"/>
    <AlertDialog open={!!request} onOpenChange={open => { if (!open) finishConfirmation(false); }}>
      <AlertDialogContent className="experience-confirm" onOpenAutoFocus={event => { event.preventDefault(); document.querySelector<HTMLButtonElement>('[data-confirm-cancel]')?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); if (trigger.current?.isConnected) trigger.current.focus(); }}>
        <AlertDialogTitle>请确认操作</AlertDialogTitle>
        <AlertDialogDescription>{request?.message}</AlertDialogDescription>
        <AlertDialogFooter><AlertDialogCancel data-confirm-cancel onClick={() => finishConfirmation(false)}>取消</AlertDialogCancel><AlertDialogAction onClick={() => finishConfirmation(true)}>{request?.label}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
