import { plainActivityText } from '../components/home/activityText';

export function searchExcerpt(post: { summary?: string; content?: string }, query: string): string {
  const summary = plainActivityText(post.summary);
  const keyword = query.trim().toLowerCase();
  if (!keyword) return summary;
  const text = summary.toLowerCase().includes(keyword) ? summary : plainActivityText(post.content);
  const match = text.toLowerCase().indexOf(keyword);
  if (match < 0) return summary;
  const start = Math.max(0, match - 45);
  const end = Math.min(text.length, Math.max(start + 180, match + keyword.length));
  return (start ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}
