import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from '../../lib/remarkGfmRead';

const markdown = unified().use(remarkParse).use(remarkGfm);
type TextNode = { type: string; value?: string; alt?: string | null; children?: TextNode[] };

function nodeText(node: TextNode): string {
  if (node.type === 'html') {
    const text = (node.value || '')
      .replace(/<!--[\s\S]*?(?:-->|$)|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<(?:(?:"[^"]*"|'[^']*')|[^'">])*>/g, tag => /^<\/?(?:br|hr|p|div|h[1-6]|li|tr|td|th)\b/i.test(tag) ? ' ' : '');
    return text === node.value ? '' : nodeText(markdown.parse(text));
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
