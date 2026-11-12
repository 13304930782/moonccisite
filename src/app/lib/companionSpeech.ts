import { ANGRY_DURATION_MS, PET_DURATION_MS } from './companionInteraction.ts';

export function interactionSpeech(kind: 'pet' | 'hit', count: number) {
  if (kind === 'hit') return count === 1 ? '哼。' : count < 4 ? '再打我真生气了。' : '生气计时加长。';
  return count === 1 ? '摸到了。' : count < 5 ? '还想再摸吗。' : count < 10 ? '今天已经被摸好几下了。' : count < 20 ? '再摸我要害羞了。' : '今天的摸摸额度快满了。';
}

export function reactionDuration(kind: 'pet' | 'hit', count: number) {
  return kind === 'pet' ? PET_DURATION_MS : ANGRY_DURATION_MS + (count >= 4 ? 1500 : 0);
}

export function pageSpeech(pathname: string) {
  if (pathname === '/') return '首页安静的时候，我就待在这儿。';
  if (/^\/(updates|activity)(?:\/|$)/.test(pathname)) return '更新都在这边。';
  if (pathname.startsWith('/article/')) return '这篇要是长，就慢慢看。';
  if (/^\/about(?:\/|$)/.test(pathname)) return '又来看介绍了。';
  if (/^\/projects(?:\/|$)/.test(pathname)) return '作品都搁在这儿。';
  return '';
}

export function idleSpeechKind(turn: number, hasPage: boolean, hasNews: boolean) {
  return turn % 4 === 0 && hasNews ? 'news' : turn % 3 === 0 && hasPage ? 'page' : 'ambient';
}

export function publicNewsTitle(title: unknown) {
  if (typeof title !== 'string') return '';
  const clean = title.trim();
  if (!clean || /预览|示例|placeholder/i.test(clean)) return '';
  return title;
}
