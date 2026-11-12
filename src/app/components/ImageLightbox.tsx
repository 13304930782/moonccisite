import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useI18n } from '../i18n';
import { safeImageSrc } from '../lib/safeUrl';
import '../../styles/image-lightbox.css';

type ImageData = { src: string; alt: string };

export function ImageLightbox({ rootRef }: { rootRef: RefObject<HTMLElement> }) {
  const { locale } = useI18n();
  const english = locale === 'en';
  const [image, setImage] = useState<ImageData | null>(null);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const marked = new Set<HTMLImageElement>();
    const refresh = () => {
      root.querySelectorAll<HTMLImageElement>('.markdown-body img, .project-detail-showcase img').forEach(element => {
        if (element.closest('a, button') || marked.has(element) || !safeImageSrc(element.getAttribute('src'))) return;
        marked.add(element);
        element.setAttribute('data-image-lightbox', '');
        element.setAttribute('tabindex', '0');
        element.setAttribute('role', 'button');
        element.setAttribute('aria-label', `${english ? 'Enlarge image' : '放大图片'}${element.alt ? `: ${element.alt}` : ''}`);
      });
    };
    const open = (event: Event) => {
      const element = event.target;
      if (!(element instanceof HTMLImageElement) || !element.hasAttribute('data-image-lightbox')) return;
      if (event instanceof KeyboardEvent && event.key !== 'Enter' && event.key !== ' ') return;
      const src = safeImageSrc(element.currentSrc || element.getAttribute('src'));
      if (!src) return;
      event.preventDefault();
      triggerRef.current = element;
      setImage({ src, alt: element.alt });
      setOpen(true);
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(root, { childList: true, subtree: true });
    root.addEventListener('click', open);
    root.addEventListener('keydown', open);
    return () => {
      observer.disconnect();
      root.removeEventListener('click', open);
      root.removeEventListener('keydown', open);
      marked.forEach(element => {
        element.removeAttribute('data-image-lightbox');
        element.removeAttribute('tabindex');
        element.removeAttribute('role');
        element.removeAttribute('aria-label');
      });
    };
  }, [rootRef, english]);

  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Portal>
      <Dialog.Overlay className="image-lightbox-overlay" />
      <Dialog.Content className="image-lightbox" aria-describedby={undefined} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }} onCloseAutoFocus={event => {
        if (triggerRef.current?.isConnected) { event.preventDefault(); triggerRef.current.focus({ preventScroll: true }); }
      }}>
        <Dialog.Title className="image-lightbox-title">{english ? 'Image preview' : '图片预览'}</Dialog.Title>
        <Dialog.Close className="image-lightbox-close" aria-label={english ? 'Close image preview' : '关闭图片预览'}><X aria-hidden="true" size={20}/></Dialog.Close>
        {image && <img className="image-lightbox-image" src={image.src} alt={image.alt}/>}
        <p className="image-lightbox-hint">{english ? 'Press Esc to close' : '按 Esc 关闭'}</p>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
