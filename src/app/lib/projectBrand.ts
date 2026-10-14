import promptDockIcon from '../../assets/projects/promptdock-icon.png';
import { safeImageSrc } from './safeUrl';

// Official asset supplied with the accepted design; source:
// https://cuegroveapp.com/promptdock-icon.png
export function projectIcon(project: { icon_image?: string | null; repo?: string; slug?: string }) {
  // Empty string is an explicit removal; null/absent retains legacy defaults.
  if (project.icon_image != null) return safeImageSrc(project.icon_image) || undefined;
  if (project.repo?.toLowerCase() === '13304930782/promptdock' || project.slug === 'promptdock') return promptDockIcon;
  return undefined;
}

export function compactProjectSummary(value: unknown) {
  const text = String(value || '').trim();
  if (text.length <= 100) return text;
  // Preserve complete sentences from the authored summary, without new claims.
  const sentences = text.match(/[^。！？.!?]+[。！？.!?]+|[^。！？.!?]+$/g) || [text];
  let result = '';
  for (const sentence of sentences) {
    if (result && result.length + sentence.length > 100) break;
    result += sentence;
  }
  return result || text;
}
