export const paginationSelector = '.pagination, .admin-pagination, .admin-posts-pagination, .media-pagination, .workspace-pagination, .submission-pagination, .mailbox-review-pagination, .engagement-pagination, .mailbox-list-pages';

export function pageScrollElement(pathname = window.location.pathname): HTMLElement | null {
  return /^\/admin(?:\/|$)/.test(pathname) ? document.querySelector<HTMLElement>('.admin-main') : null;
}
export function pageScrollTop(pathname?: string) {
  return pageScrollElement(pathname)?.scrollTop ?? window.scrollY;
}
export function scrollPageTo(top: number, pathname?: string) {
  const scroller = pageScrollElement(pathname);
  if (Math.abs((scroller?.scrollTop ?? window.scrollY) - top) > .5) (scroller || window).scrollTo({ top, behavior: 'instant' });
}
export function paginationState(nav: Element | null, pathname: string, state: unknown) {
  return nav ? { ...state as object, pagination: { pathname, index: Array.from(nav.ownerDocument.querySelectorAll(paginationSelector)).indexOf(nav), top: nav.getBoundingClientRect().top } } : state;
}
