import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from '../../lib/remarkGfmRead';

const markdown = unified().use(remarkParse).use(remarkGfm);
type TextNode = { type: string; value?: string; alt?: string | null; children?: TextNode[] };

function nodeText(node: TextNode): string {
  if (node.type === 'html') {
    const source = node.value || '';
    const markup = /<!--[\s\S]*?(?:-->|$)|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<(?:(?:"[^"]*"|'[^']*')|[^'">])*>/gi;
    const parts: string[] = [];
    let offset = 0;
    // Keep Markdown across spans, but encode angle brackets before parsing so joined text cannot become HTML.
    for (const match of source.matchAll(markup)) {
      if (match.index > offset) parts.push(source.slice(offset, match.index));
      if (/^<\/?(?:br|hr|p|div|h[1-6]|li|tr|td|th)\b/i.test(match[0])) parts.push(' ');
      offset = match.index + match[0].length;
    }
    if (!offset) return '';
    if (offset < source.length) parts.push(source.slice(offset));
    return nodeText(markdown.parse(parts.join('').replace(/</g, '&lt;').replace(/>/g, '&gt;')));
  }
  if (node.type === 'image' || node.type === 'imageReference') return node.alt || '';
  if (node.type === 'definition') return '';
  const text = node.children?.map(nodeText).join('') ?? node.value ?? '';
  return ['paragraph', 'heading', 'listItem', 'code', 'break', 'tableCell'].includes(node.type)
    ? text + ' '
    : text;
}

export function plainActivityText(value: unknown): string {
  return nodeText(markdown.parse(String(value ?? ''))).replace(/\s+/g, ' ').trim();
}

export function homeActivityText(item: { type: string; title?: unknown; excerpt?: unknown }) {
  const originalTitle = plainActivityText(item.title);
  let title = originalTitle;
  let excerpt = plainActivityText(item.excerpt);
  if (item.type === 'release') {
    const separator = title.indexOf(' · ');
    if (separator > 0) {
      const name = title.slice(0, separator);
      const rest = title.slice(separator + 3).trim();
      if (rest.startsWith(name)) title = rest;
    }
    for (const prefix of [originalTitle, title]) {
      const rest = excerpt.slice(prefix.length);
      if (prefix && excerpt.startsWith(prefix) && (!rest || /^[\s:：—–-]/.test(rest))) {
        excerpt = rest.replace(/^[\s:：—–-]+/, '').trim();
        break;
      }
    }
  }
  const fallback: Record<string, string> = { post: '查看文章', update: '查看近况', release: '查看版本更新' };
  return { title: title || fallback[item.type] || '查看更新', excerpt };
}
