import { useI18n } from '../i18n';
import { notify } from '../lib/feedback';
import {useState} from 'react';

import {Link} from './LocaleLink';
import {api} from '../lib/api';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
export function MailFailureTasks({count,onQueued}:{count:number;onQueued:()=>void}){
  const { t } = useI18n();
 const [open,setOpen]=useState(false),[items,setItems]=useState<any[]|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[target,setTarget]=useState<number|null>(null);
 async function load(){setError('');setBusy(true);try{setItems((await api('/admin/operations/mail-failures')).items);}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 async function retry(){setError('');setBusy(true);try{const r=await api('/admin/operations/mail-failures/'+target+'/retry',{method:'POST'});setTarget(null);setMessage(r.message);await load();onQueued();}catch(e:any){setError(e.message); notify.error(e.message);}finally{setBusy(false);}}
 if(!count&&!open)return null;
 return <div className="mail-failure-panel"><p>{count}  {t("m_85afb82abc")}</p><div className="inline-actions"><Link to="/admin/mail-settings">{t("m_3739038fa7")}</Link><Link to="/admin/runtime">{t("m_0ec535ccff")}</Link><button disabled={busy} onClick={()=>{setOpen(true);void load();}}>{open?t("m_b2786a1259"):t("m_1ca89279a4")}</button></div>{message&&<p role="status">{t(message || '')}</p>}{error&&!target&&<p role="alert">{t(error || '')}</p>}{open&&<><p className="operations-note">{t("m_bfe9f3a24a")}</p>{items?.length===0?<p>{t("m_406ba84549")}</p>:items?.map(j=><div className="operations-todo" key={j.id}><div><strong>{t("m_5a039d5c59")}{j.id}</strong><p>{j.reason}  {t("m_27f9ce5544")} {j.attempts}  {t("m_3d6550d07d")}</p></div><button className="engagement-button" disabled={busy} onClick={()=>{setError('');setTarget(j.id);}}>{t("m_a6d7a1c530")}</button></div>)}</>}
 <Dialog open={target!==null} onOpenChange={v=>{if(!v&&!busy)setTarget(null);}}><DialogContent className="workspace-form-dialog"><DialogTitle>{t("m_ba3b950410")}</DialogTitle><DialogDescription>{t("m_ac33b253dd")}</DialogDescription>{error&&<p role="alert">{t(error || '')}</p>}<button data-dialog-cancel disabled={busy} onClick={()=>setTarget(null)}>{t("m_2cd0f3be87")}</button><button className="account-primary-button" disabled={busy} onClick={()=>void retry()}>{busy?t("m_4363ad729b"):t("m_5f6b6fdce8")}</button></DialogContent></Dialog></div>;
}
