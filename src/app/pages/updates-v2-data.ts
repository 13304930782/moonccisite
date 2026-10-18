import { plainActivityText } from '../components/home/activityText';

export type UpdateActivity = {
  activity_id: string;
  id: number;
  type: 'post' | 'update' | 'release';
  title?: string;
  excerpt?: string;
  published_at: string;
  path: string;
  historical?: number | boolean;
  prerelease?: number | boolean;
  cover_image?: string;
  cover_crop?: unknown;
  comment_count?: number;
};

export function groupUpdates(items: readonly UpdateActivity[]): { key: string; label: string; items: UpdateActivity[] }[] {
  const dated = items.map(item => ({ item, date: new Date(item.published_at || '') }));
  dated.sort((a, b) => (Number.isNaN(b.date.getTime()) ? -Infinity : b.date.getTime()) - (Number.isNaN(a.date.getTime()) ? -Infinity : a.date.getTime()));
  const groups = new Map<string, { key: string; label: string; items: UpdateActivity[] }>();
  for (const { item, date } of dated) {
    const valid = !Number.isNaN(date.getTime());
    // Match formatDate's browser-local calendar, rather than slicing a UTC timestamp.
    const key = valid ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : 'unknown';
    if (!groups.has(key)) groups.set(key, { key, label: valid ? `${date.getFullYear()}年${date.getMonth() + 1}月` : '日期未知', items: [] });
    groups.get(key)!.items.push(item);
  }
  return [...groups.values()];
}

function withoutLeadingTitle(text: string, titles: string[]): string {
  for (const title of titles) {
    const rest = text.slice(title.length);
    if (title && text.startsWith(title) && (!rest || /^[\s:：—–-]/.test(rest))) return rest.replace(/^[\s:：—–-]+/, '').trim();
  }
  return text;
}

export function updateText(item: UpdateActivity): { title: string; excerpt: string } {
  const original = plainActivityText(item.title);
  if (item.type === 'update') return { title: '', excerpt: plainActivityText(item.excerpt || item.title) };
  if (item.type !== 'release') return { title: original || '查看文章', excerpt: plainActivityText(item.excerpt) };
  let title = original;
  const separator = title.indexOf(' · ');
  if (separator > 0) {
    const project = title.slice(0, separator), rest = title.slice(separator + 3).trim();
    if (rest === project || rest.startsWith(`${project} `) || rest.startsWith(`${project}·`)) title = rest;
  }
  // Split before the shared cleaner flattens paragraph boundaries; discard hidden HTML first.
  const paragraphs = String(item.excerpt || '')
    .replace(/<!--[\s\S]*?(?:-->|$)|<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<\/(?:p|div|h[1-6]|li)>|<br\s*\/?>/gi, '\n\n')
    .replace(/^(#{1,6}\s+[^\n]*)$/gm, line => line + '\n')
    .split(/\r?\n\s*\r?\n/);
  let excerpt = '';
  for (const paragraph of paragraphs) {
    const text = withoutLeadingTitle(plainActivityText(paragraph), [original, title]);
    if (!text || /^(?:what[’']?s new|release notes|changelog|本次更新|更新内容|更新日志)(?:\s*[/／·|]\s*(?:本次更新|更新内容|更新日志))?[\s:：]*$/i.test(text)) continue;
    // Keep decimals, versions and URLs intact: English sentence endings require whitespace/end.
    excerpt = text.match(/^.*?(?:[。！？]|[.!?](?=\s|$))/)?.[0] || text;
    break;
  }
  return { title: title || '查看版本更新', excerpt };
}



