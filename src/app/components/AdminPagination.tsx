export function AdminPagination({ label, page, total, disabled, onPage }: {
  label: string; page: number; total: number; disabled: boolean; onPage: (page: number) => void;
}) {
  return <nav aria-label={label} className="admin-pagination">
    <button disabled={disabled || page <= 1} onClick={() => onPage(page - 1)} className="rounded border px-4 py-2 disabled:opacity-50">上一页</button>
    <span>共 {total} 条，第 {page} / {Math.max(1, Math.ceil(total / 50))} 页</span>
    <button disabled={disabled || page * 50 >= total} onClick={() => onPage(page + 1)} className="rounded border px-4 py-2 disabled:opacity-50">下一页</button>
  </nav>;
}
