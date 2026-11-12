import { useI18n } from '../i18n';
import {useState} from 'react';

import {Link} from './LocaleLink';
import {CheckCircle2, CircleAlert, ArrowRight} from 'lucide-react';
import {api} from '../lib/api';
import '../../styles/workflow-feedback.css';
export function ArticleImport(){
  const { t } = useI18n();
 const [url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<any>(null);
 async function submit(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');setResult(null);try{setResult(await api('/article-drafts/import',{method:'POST',body:JSON.stringify({url})}));}catch(e:any){setError(e.message||t("m_527462039f"));}finally{setBusy(false);}}
 const warnings=Array.isArray(result?.warnings)?result.warnings:[];
 return <details className="article-import workflow-feedback"><summary>{t("m_7baf7dde97")}</summary><p>{t("m_cd76e9423d")}</p><form onSubmit={submit}><label htmlFor="article-import-url">{t("m_ab92ac1124")}</label><div className="article-import-input"><input id="article-import-url" type="url" required value={url} onChange={e=>setUrl(e.target.value)} placeholder={t("m_ca03fbf71d")} disabled={busy}/><button className="workflow-button" disabled={busy||!url.trim()}>{busy?t("m_f6dc1b1641"):t("m_78487d2800")}</button></div></form>{busy&&<p role="status">{t("m_5aedbb2e46")}</p>}{error&&<div className="workflow-result" role="alert"><CircleAlert size={20} aria-hidden="true"/><div><h3>{t("m_4ab629b173")}</h3><p>{t(error || '')}</p></div></div>}{result&&<section className="workflow-result"><CheckCircle2 size={20} aria-hidden="true"/><div className="workflow-result-body"><div role="status"><h3>{result.replayed?t("m_db0c76b56a"):t("m_5c0a65a4a1")}</h3><p>{result.replayed?t("m_1584d731c6"):t("m_d24db5e7f9", {v0: result.image_count||0})}{warnings.length>0&&t("m_67f59eb852", {v0: warnings.length})}</p></div><Link className="workflow-button workflow-primary" to={result.draft_id?`/admin/write?draft=${result.draft_id}`:`/admin/posts/${result.post_id}/edit`}>{result.draft_id?t("m_ad28995c6c"):t("m_30cc4c624f")}<ArrowRight size={16} aria-hidden="true"/></Link>{warnings.length>0&&<details className="workflow-warning-details"><summary><CircleAlert size={16} aria-hidden="true"/>{t("m_db8db05304")} {warnings.length}  {t("m_fea24928cd")}</summary><ul>{warnings.map((w:string,i:number)=><li key={i}>{w}</li>)}</ul></details>}</div></section>}</details>;
}
