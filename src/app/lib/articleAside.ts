type ArticleAside = { path: string; locale: string; text: string } | null;
let current: ArticleAside = null;
const listeners = new Set<() => void>();

export const articleAsideStore = {
  getSnapshot: () => current,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  set(path: string, locale: string, text: string) {
    current = text ? { path, locale, text } : null;
    listeners.forEach(listener => listener());
  },
  clear(path: string) {
    if (current?.path === path) { current = null; listeners.forEach(listener => listener()); }
  },
};
