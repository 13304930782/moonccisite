const pageLoaders = {
  '/login': () => import('../pages/LoginPage'),
  '/register': () => import('../pages/RegisterPage'),
  '/search': () => import('../pages/SearchPage'),
  '/article': () => import('../pages/ArticlePage'),
  '/updates': () => import('../pages/UpdatesPage'),
  '/articles': () => import('../pages/ArticlesPage'),
  '/projects': () => import('../pages/ProjectsPage'),
  '/electricity': () => import('../pages/ElectricityPage'),
  '/early-access': () => import('../pages/EarlyAccessPage'),
};
type Page = keyof typeof pageLoaders;
const pending = new Map<Page, Promise<any>>();
export function loadPage(page: Page) {
  let task = pending.get(page);
  if (!task) {
    task = pageLoaders[page]().catch(error => { pending.delete(page); throw error; });
    pending.set(page, task);
  }
  return task;
}
export function preloadPage(path: string) {
  const pathname = path.split(/[?#]/, 1)[0];
  const key = (Object.keys(pageLoaders) as Page[]).find(prefix => pathname === prefix || pathname.startsWith(prefix + '/'));
  if (key) void loadPage(key).catch(() => {});
}
