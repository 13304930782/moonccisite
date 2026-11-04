import { useI18n } from '../../i18n';
export function SaveBar({dirty,saving,onDiscard,onSave}:{dirty:boolean;saving:boolean;onDiscard:()=>void;onSave:()=>void}) {
  const { t } = useI18n();
  return <header className="bp-save-bar">
    <div><h1>{t("m_aa52ce6f17")}</h1><p>{t("m_837751f124")}</p></div>
    <div className="bp-save-actions"><span className="bp-save-status" role="status">{saving?t("m_6bdb443509"):dirty?t("m_6265f9d3f3"):t("m_1bd91a7d0c")}</span>
      <button type="button" disabled={!dirty||saving} onClick={onDiscard}>{t("m_ef804eda90")}</button>
      <button type="button" className="bp-primary" disabled={!dirty||saving} onClick={onSave}>{saving?t("m_6bdb443509"):t("m_c8550237ba")}</button>
    </div>
  </header>;
}
