import DOMPurify from 'dompurify';

export function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === 'youtu.be') id = /^\/([\w-]{11})\/?$/.exec(url.pathname)?.[1] || null;
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(host)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(?:embed|shorts|live)\/([\w-]{11})\/?$/.exec(url.pathname)?.[1] || null;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

export const youtubeEmbedUrl = (id: string, start = 0) => /^[\w-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}?playsinline=1${Number.isInteger(start) && start > 0 && start <= 86400 ? `&start=${start}` : ''}` : '';

export function parseYoutubeEmbed(value: string): {id: string; start: number} | null {
  let source = value.trim();
  if (source.startsWith('<')) {
    const fragment = DOMPurify.sanitize(source, {ALLOWED_TAGS: ['iframe'], ALLOWED_ATTR: ['src'], RETURN_DOM_FRAGMENT: true});
    if (fragment.children.length !== 1 || fragment.firstElementChild?.tagName !== 'IFRAME' || fragment.textContent?.trim()) return null;
    source = fragment.firstElementChild.getAttribute('src') || '';
  }
  const id = youtubeVideoId(source);
  if (!id) return null;
  const url = new URL(source);
  const raw = url.searchParams.get('start') || url.searchParams.get('t') || '0';
  const seconds = /^\d+s?$/.test(raw) ? Number(raw.replace(/s$/, '')) : 0;
  return {id, start: Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= 86400 ? seconds : 0};
}
