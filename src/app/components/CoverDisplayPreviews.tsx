import { useI18n } from '../i18n';
import {CoverImage} from './CoverImage';
import {CardCoverImage} from './CardCoverImage';
import {coverFrame,effectiveCoverFrame,normalizeCoverCrop} from '../lib/coverCrop';

// Read-only, submitted snapshot previews. The original file remains untouched.
export function CoverDisplayPreviews({src,crop}:{src:string;crop:unknown}){
  const { t } = useI18n();
 const detail=normalizeCoverCrop(crop)?effectiveCoverFrame(coverFrame(crop,'detail'),'detail'):{x:.5,y:.3,zoom:1};
 return <section className="cover-framing-previews cover-display-previews" aria-label={t("m_be8d075584")}>
  <figure className="cover-framing-preview-card"><figcaption>{t("m_b5862edd94")}</figcaption><div className="cover-framing-preview cover-card-full"><CardCoverImage src={src} alt={t("m_176e7e1b76")}/></div></figure>
  <figure><figcaption>{t("m_e45c5034b0")}</figcaption><div className="cover-framing-preview" style={{aspectRatio:'16 / 9'}}><CoverImage src={src} frame={detail} alt={t("m_51740e0cfd")}/></div></figure>
  <figure><figcaption>{t("m_ac6ac88ecd")}</figcaption><div className="cover-framing-preview" style={{aspectRatio:'4 / 3'}}><CoverImage src={src} frame={detail} alt={t("m_2bd675dd69")}/></div></figure>
 </section>;
}
