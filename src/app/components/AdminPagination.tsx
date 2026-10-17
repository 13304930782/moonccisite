import { useLocation, type NavigateOptions } from 'react-router-dom';
import { paginationState } from '../lib/pageScroll';

export function AdminPagination({ label, page, total, disabled, onPage }: {
  label: string; page: number; total: number; disabled: boolean; onPage: (page: number, options?: NavigateOptions) => void;
}) {
  const location = useLocation();
  const changePage = (page: number, button: HTMLElement) => onPage(page, { state: paginationState(button.closest('nav'), location.pathname, location.state) });
  return <nav aria-label={label} className="admin-pagination">
    <button disabled={disabled || page <= 1} onClick={event => changePage(page - 1, event.currentTarget)} className="min-h-11 min-w-11 rounded border px-4 py-2 disabled:opacity-50">上一页</button>
    <span>共 {total} 条，第 {page} / {Math.max(1, Math.ceil(total / 50))} 页</span>
    <button disabled={disabled || page * 50 >= total} onClick={event => changePage(page + 1, event.currentTarget)} className="min-h-11 min-w-11 rounded border px-4 py-2 disabled:opacity-50">下一页</button>
  </nav>;
}
