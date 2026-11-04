import { useI18n } from '../i18n';

import {Link} from './LocaleLink';
import {stripLegacyAgeNotice} from '../lib/articleAge';
import '../../styles/article-summary-settings.css';

type Props={
 form:any; ai:any; owner:boolean; busy:boolean; blocked:boolean;
 onChange:(key:string,value:any)=>void; onUpdate:(value:any)=>void;
 onGenerate:()=>void; error:string;
};
export function ArticleSummaryFields({form,ai,owner,busy,blocked,onChange,onUpdate,onGenerate,error}:Props){
  const { t } = useI18n();
 const summary=stripLegacyAgeNotice(form.summary),length=Array.from(summary).length;
 const automatic=form.summary_mode==='ai'||!summary.trim()&&form.summary_mode!=='manual';
 return <section className="article-settings-section article-summary-editor">
  <h2>{t("m_dfb4e81d3e")}</h2>
  <label className="article-summary-toggle">
   <input type="checkbox" checked={automatic} aria-describedby="article-summary-mode-hint" onChange={e=>onUpdate((p:any)=>({...p,summary_mode:e.target.checked?'ai':'manual',summary_receipt:''}))}/>
   <span>{t("m_261c784f84")}</span>
  </label>
  <div className="article-summary-help" id="article-summary-mode-hint">
   <p>{ai?.enabled?t("m_0eabace44a"):ai?.unavailable?t("m_e92543b224"):t("m_a6867eee9e")}</p>
   {owner&&<Link className="text-link" to="/admin/ai-settings">{t("m_d02656b388")}</Link>}
  </div>
  <label htmlFor="article-summary">{t("m_dfb4e81d3e")}</label>
  <textarea id="article-summary" rows={4} value={summary} onChange={e=>onChange('summary',e.target.value)} placeholder={t("m_417a1c538e")} aria-describedby="article-summary-length"/>
  <div className="article-summary-meta" id="article-summary-length"><span>{length}  {t("m_c55038b272")}</span><span>{t("m_0d25a40e88")}</span></div>
  {form.summary_mode==='ai'&&<p className="article-summary-hint" role="status">{form.summary_receipt?t("m_299d4c0238"):t("m_63795bee11")}</p>}
  {error&&<p className="article-summary-error" id="article-summary-error" role="alert">{t(error || '')}  {t("m_3c447d3799")}</p>}
  <div className="inline-actions"><button className="article-button" type="button" disabled={!ai?.enabled||busy||blocked} onClick={onGenerate} aria-describedby={error?'article-summary-error':undefined}>{t("m_f69c885602")}</button></div>
 </section>;
}
