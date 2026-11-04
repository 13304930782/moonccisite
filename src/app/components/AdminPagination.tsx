import { useI18n } from '../i18n';
export function AdminPagination({ label, page, total, disabled, onPage }: {
  label: string; page: number; total: number; disabled: boolean; onPage: (page: number) => void;
}) {
  const { t } = useI18n();
  return <nav aria-label={label} className="admin-pagination">
    <button type="button" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)} className="min-h-11 min-w-11 rounded border px-4 py-2 disabled:opacity-50">{t("m_c9b9ae7a61")}</button>
    <span aria-live="polite" aria-atomic="true">{t("m_76e547a8fa")} {total}  {t("m_dfff79c31c")} {page} / {Math.max(1, Math.ceil(total / 50))}  {t("m_d24d3c9946")}</span>
    <button type="button" disabled={disabled || page * 50 >= total} onClick={() => onPage(page + 1)} className="min-h-11 min-w-11 rounded border px-4 py-2 disabled:opacity-50">{t("m_8a8542f696")}</button>
  </nav>;
}
