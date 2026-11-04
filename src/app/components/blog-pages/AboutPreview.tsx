import { useI18n } from '../../i18n';
import {AboutContent,type AboutData} from '../AboutContent';
export function AboutPreview({about}:{about:AboutData}){
  const { t } = useI18n();
 return <aside className="bp-preview" aria-label={t("m_8243e86752")}><div className="bp-preview-title"><strong>{t("m_a76fdaad75")}</strong><span className="bp-badge">{t("m_83e893be1d")}</span></div><div className="bp-preview-box">{about.enabled?<AboutContent about={about}/>:<p className="bp-empty">{t("m_f64485cee8")}</p>}</div></aside>;
}
