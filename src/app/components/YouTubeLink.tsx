import { useI18n } from '../i18n';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import {Root as Popover, Content as PopoverContent, Anchor as PopoverAnchor, Portal} from '@radix-ui/react-popover';
import {youtubeVideoId} from '../lib/youtube';
import {api} from '../lib/api';
import '../../styles/youtube-link.css';

export function YouTubeLink({href, children}: {href: string; children: ReactNode}) {
  const { t } = useI18n();
  const id = youtubeVideoId(href);
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<{title: string; author: string} | null>(null);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = () => {clearTimeout(timer.current); setOpen(true);};
  const hide = () => {clearTimeout(timer.current); timer.current=setTimeout(()=>setOpen(false),150);};
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  useEffect(() => {
    if (!open || !id) return;
    const controller = new AbortController();
    setInfo(null); setFailed(false);
    api(`/youtube-preview/${id}`, {signal: controller.signal, timeoutMs: 6000})
      .then(data => {if (!controller.signal.aborted) setInfo(data);})
      .catch(() => {if (!controller.signal.aborted) setFailed(true);});
    return () => controller.abort();
  }, [open, id]);
  const link = <a href={href} target="_blank" rel="noopener noreferrer" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>{children}</a>;
  if (!id) return link;
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverAnchor asChild>{link}</PopoverAnchor>
    {open && <Portal><PopoverContent aria-label={t("m_d11afa0825")} className="youtube-link-preview" sideOffset={8} collisionPadding={12} onOpenAutoFocus={event=>event.preventDefault()} onCloseAutoFocus={event=>event.preventDefault()} onMouseEnter={show} onMouseLeave={hide}>
      <img src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt={t("m_cd088db224")} onError={event => {event.currentTarget.style.display='none';}}/>
      <div><small>YouTube</small><strong>{info?.title || (failed ? t("m_6b2ce6ac7f") : t("m_d99174a902"))}</strong>
        <span>{info?.author || (failed ? t("m_68787751a9") : '')}</span></div>
    </PopoverContent></Portal>}
  </Popover>;
}
