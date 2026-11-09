import { api } from './api';
import { localeResource, splitLocalePath } from './locale';
import { readSnapshot, snapshotGeneration, writeSnapshot } from './publicSnapshots';

// Detail endpoints can also return drafts to signed-in editors. Only anonymous,
// explicitly published responses enter this shared cache.
export const articleResourcePath = (path: string) => /^\/posts\/[^/?]+(?:\?locale=en)?$/.test(path) && !/^\/posts\/(?:archives|meta)(?:\?|$)/.test(path);
const pending = new Map<string, Promise<any>>();
export function articleResourceForUrl(pathname: string) {
  const {locale, pathname: path} = splitLocalePath(pathname);
  const match = /^\/article\/([^/]+)$/.exec(path);
  return match ? localeResource(`/posts/${match[1]}`, locale) : null;
}
export function prefetchArticle(pathname: string) {
  const path = articleResourceForUrl(pathname);
  if (!path || readSnapshot(path) || pending.has(path) || pending.size >= 8) return;
  const generation = snapshotGeneration();
  const task = api(path, {credentials:'omit'}).then(data => {
    if (data?.status !== 'published') return null;
    writeSnapshot(path, data, generation);
    const locale = splitLocalePath(pathname).locale;
    for (const id of [data.id, data.slug]) if (id) writeSnapshot(localeResource(`/posts/${encodeURIComponent(id)}`, locale), data, generation);
    return generation === snapshotGeneration() ? data : null;
  }).catch(() => null).finally(() => { if (pending.get(path) === task) pending.delete(path); });
  pending.set(path, task);
}
export function pendingArticle(path: string) { return pending.get(path); }
