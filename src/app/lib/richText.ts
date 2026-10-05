import DOMPurify from 'dompurify';
import {safeHref, safeImageSrc} from './safeUrl';
export const RICH_TEXT_MARKER = '<!--mooncci-richtext:v1-->';
export const isRichText = (value: string) => String(value || '').startsWith(RICH_TEXT_MARKER);
const tags = ['p','br','h1','h2','h3','h4','h5','h6','strong','b','em','i','s','del','u','code','pre','blockquote','ul','ol','li','a','img','hr','mark','sub','sup','span','div','label','input','table','thead','tbody','tr','th','td','colgroup','col'];
/** One allowlist for editor imports and public rendering. No arbitrary CSS, classes or URL attributes. */
export function richTextFragment(value: string): DocumentFragment {
  const fragment = DOMPurify.sanitize(isRichText(value) ? value.slice(RICH_TEXT_MARKER.length) : value, {
    ALLOWED_TAGS: tags,
    ALLOWED_ATTR: ['href','src','alt','title','style','start','colspan','rowspan','colwidth','data-type','data-checked','type','checked','class'],
    ALLOW_DATA_ATTR: false, RETURN_DOM_FRAGMENT: true,
  });
  for (const el of Array.from(fragment.querySelectorAll('*'))) {
    if (el.hasAttribute('href')) { const url = safeHref(el.getAttribute('href')); if(url) el.setAttribute('href',url); else el.removeAttribute('href'); }
    if (el.hasAttribute('src')) { const url = safeImageSrc(el.getAttribute('src')); if(url) el.setAttribute('src',url); else el.removeAttribute('src'); }
    const style = (el as HTMLElement).style;
    const align = style.textAlign, color = style.backgroundColor;
    el.removeAttribute('style');
    if (['left','center','right','justify'].includes(align)) style.textAlign = align;
    if (el.tagName === 'MARK' && /^(#[0-9a-f]{3,8}|rgba?\([\d.,%\s]+\)|[a-z]+)$/i.test(color)) style.backgroundColor = color;
    const cls = el.getAttribute('class') || '';
    el.removeAttribute('class');
    if (el.tagName === 'CODE' && /^language-[a-z0-9_+-]+$/i.test(cls)) el.setAttribute('class',cls);
    if (!['taskList','taskItem','image-upload'].includes(el.getAttribute('data-type') || '')) el.removeAttribute('data-type');
    if (el.tagName === 'INPUT') { el.setAttribute('type','checkbox'); el.setAttribute('disabled',''); }
    for (const key of ['start','colspan','rowspan']) if (el.hasAttribute(key) && !/^\d{1,4}$/.test(el.getAttribute(key)!)) el.removeAttribute(key);
  }
  return fragment;
}
export function sanitizeRichText(value: string): string {
  const container = document.createElement('div'); container.append(richTextFragment(value)); return container.innerHTML;
}
export function richTextHasContent(value: string): boolean {
  if (!isRichText(value)) return !!value.trim();
  const fragment = richTextFragment(value);
  return !!fragment.textContent?.trim() || !!fragment.querySelector('img[src],table,hr');
}
