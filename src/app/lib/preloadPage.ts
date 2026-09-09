export const pageLoaders: Record<string, () => Promise<unknown>> = {
  '/updates': () => import('../pages/UpdatesPage'),
  '/articles': () => import('../pages/ArticlesPage'),
  '/projects': () => import('../pages/ProjectsPage'),
  '/electricity': () => import('../pages/ElectricityPage'),
  '/early-access': () => import('../pages/EarlyAccessPage'),
};
export function preloadPage(path: string) {
  const key = Object.keys(pageLoaders).find(prefix => path === prefix || path.startsWith(prefix + '/'));
  if (key) void pageLoaders[key]().catch(() => {});
}
