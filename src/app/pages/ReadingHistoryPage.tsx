import { useI18n } from '../i18n';
import { articlePath } from '../lib/articleUrl';
import {useEffect,useState} from 'react';

import {Link} from '../components/LocaleLink';
import {History} from 'lucide-react';
import {api} from '../lib/api';
import {useEngagement} from '../lib/useEngagement';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../components/ui/dialog';
export default function ReadingHistoryPage(){
  const { locale,  t } = useI18n();
 const [page,setPage]=useState(1),[total,setTotal]=useState(0);
 const enabled=useEngagement(),[items,setItems]=useState<any[]|null>(null),[prefs,setPrefs]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false);
 const load=async()=>{try{const [r,p]=await Promise.all([api('/engagement/history?page='+page),api('/engagement/preferences')]);setItems(r.items);setTotal(r.total||0);if(r.page&&r.page!==page)setPage(r.page);setPrefs(p);setError('');}catch(e:any){setError(e.message);}};
 useEffect(()=>{if(enabled)void load();},[enabled,page]);
 const act=async(fn:()=>Promise<any>)=>{setBusy(true);try{await fn();await load();setConfirm(false);}catch(e:any){setError(e.message);}finally{setBusy(false);}};
 return <section><header className="account-page-heading"><div><span className="account-eyebrow">{t("m_992be7fe00")}</span><h1>{t("m_1aac8f2911")}</h1><p>{t("m_01b4cdd5df")}</p></div><button className="engagement-button" disabled={!items?.length||busy} onClick={()=>setConfirm(true)}>{t("m_17ac4a3317")}</button></header>
 {error&&<p role="alert" className="engagement-alert">{t(error || '')}<button onClick={()=>void load()}>{t("m_b8784c8dd5")}</button></p>}
 {prefs&&<label className="engagement-panel engagement-toggle"><div><strong>{t("m_052c1aaa6f")}</strong><small>{t("m_19e291f788")}</small></div><input type="checkbox" checked={prefs.history_enabled} disabled={busy} onChange={e=>void act(()=>api('/engagement/preferences',{method:'PUT',body:JSON.stringify({history_enabled:e.target.checked})}))}/></label>}
 <div className="engagement-panel">{!enabled?<p>{t("m_e71a3f21cd")}</p>:items===null?<p role="status">{t("m_35ced93b32")}</p>:!items.length?<div className="engagement-empty"><History size={28}/><h2>{t("m_7a256cc869")}</h2><p>{t("m_e0fa4fb714")}</p><Link className="account-primary-button" to="/articles">{t("m_fd232f2ce5")}</Link></div>:items.map(h=><article className="history-row" key={h.post_id}><div><h2><Link to={articlePath({id:h.post_id,slug:h.slug})+'?resume=1'}>{h.title}</Link></h2><p>{t("m_efdd1a47e4")} {Math.round(h.progress*100)}% · {new Date(Number(h.updated_at)).toLocaleString(locale,{timeZone:'Asia/Shanghai'})}</p><progress value={h.progress} max={1}/></div><div className="engagement-actions"><Link to={articlePath({id:h.post_id,slug:h.slug})+'?resume=1'}>{t("m_6e51e5007d")}</Link><button disabled={busy} onClick={()=>void act(()=>api('/engagement/history/'+h.post_id,{method:'DELETE'}))}>{t("m_2f9daa8289")}</button></div></article>)}</div>
 {total>30&&<div className="engagement-pagination"><button disabled={page===1} onClick={()=>setPage(page-1)}>{t("m_c9b9ae7a61")}</button><span>{t("m_af50a0fe2a")} {page}  {t("m_d24d3c9946")}</span><button disabled={page*30>=total} onClick={()=>setPage(page+1)}>{t("m_8a8542f696")}</button></div>}
 <Dialog open={confirm} onOpenChange={setConfirm}><DialogContent className="workspace-form-dialog"><DialogTitle>{t("m_7b579d835a")}</DialogTitle><DialogDescription>{t("m_c821f832ad")}</DialogDescription><button data-dialog-cancel disabled={busy} onClick={()=>setConfirm(false)}>{t("m_2cd0f3be87")}</button><button className="account-primary-button" disabled={busy} onClick={()=>void act(()=>api('/engagement/history',{method:'DELETE'}))}>{t("m_3c7a4fb356")}</button></DialogContent></Dialog>
 </section>;
}
