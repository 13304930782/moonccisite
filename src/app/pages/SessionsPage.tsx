import { useI18n } from '../i18n';
import { notify } from '../lib/feedback';
import {useEffect,useState} from 'react';
import {Monitor,Smartphone,ShieldCheck} from 'lucide-react';
import {api} from '../lib/api';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../components/ui/dialog';
import '../../styles/account-operations.css';
type Session={id:string;browser:string;os:string;first_seen:number;last_seen:number;expires_at:number;current:boolean;legacy:boolean};
const time=(v:number,locale='zh-CN')=>new Date(Number(v)).toLocaleString(locale,{timeZone:'Asia/Shanghai'});
export default function SessionsPage(){
  const { locale,  t } = useI18n();
 const [items,setItems]=useState<Session[]|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[target,setTarget]=useState<Session|'others'|null>(null),[message,setMessage]=useState('');
 const load=async()=>{try{const r=await api('/account/sessions');setItems(r.items);setError('');}catch(e:any){setError(e.message);}};
 useEffect(()=>{void load();},[]);
 const revoke=async()=>{if(!target)return;setBusy(true);setError('');try{const r=await api(target==='others'?'/account/sessions/revoke-others':'/account/sessions/'+target.id,{method:target==='others'?'POST':'DELETE'});if(r.current){window.location.assign('/login');return;}setTarget(null);notify.success(target==='others'?t("m_932634945c"):t("m_ce17e42fef"));await load();}catch(e:any){setError(e.message); notify.error(e.message);}finally{setBusy(false);}};
 return <section className="sessions-page"><header className="account-page-heading"><div><span className="account-eyebrow">{t("m_2079bd640f")}</span><h1>{t("m_cd438f5d0c")}</h1><p>{t("m_d7ea23c2f2")}</p></div><button className="engagement-button" disabled={busy||!items} onClick={()=>{setError('');setTarget('others');}}>{t("m_4f6254daf8")}</button></header>
 {message&&<p className="workspace-alert" role="status">{t(message || '')}</p>}{error&&!target&&<p role="alert" className="workspace-alert">{t(error || '')}<button onClick={()=>void load()}>{t("m_b8784c8dd5")}</button></p>}
 <div className="session-help"><ShieldCheck size={18}/><p>{t("m_995baf465b")}</p></div>
 <div className="engagement-panel">{!items?<div className="workspace-empty" role="status">{t("m_ea9e465d59")}</div>:!items.length?<div className="workspace-empty"><h2>{t("m_5046312fcd")}</h2></div>:items.map(s=><article className="session-row" key={s.id}><span className="session-icon">{/Android|iOS/.test(s.os)?<Smartphone/>:<Monitor/>}</span><div className="session-content"><div className="session-heading"><h2>{s.browser} · {s.os}</h2>{s.current&&<span className="workflow-badge workflow-approved">{t("m_9800a458c1")}</span>}{Boolean(s.legacy)&&<span className="workflow-badge">{t("m_0eccd0db7b")}</span>}</div><dl><div><dt>{t("m_5fbdef3c10")}</dt><dd>{time(s.first_seen,locale)}</dd></div><div><dt>{t("m_c1d6dc3260")}</dt><dd>{time(s.last_seen,locale)}</dd></div><div><dt>{t("m_9ca4b75d03")}</dt><dd>{time(s.expires_at,locale)}</dd></div></dl></div><button className="engagement-button" disabled={busy} aria-label={t("m_498e1d59b4")+s.browser+' '+s.os+(s.current?t("m_9800a458c1"):'')} onClick={()=>{setError('');setTarget(s);}}>{t("m_498e1d59b4")}{s.current?t("m_9800a458c1"):''}</button></article>)}</div><p className="operations-note">{t("m_4377b7854d")}</p>
 <Dialog open={!!target} onOpenChange={open=>{if(!open&&!busy){setTarget(null);setError('');}}}><DialogContent className="workspace-form-dialog"><DialogTitle>{target==='others'?t("m_662a4e00d3"):target?.current?t("m_28283cde6e"):t("m_df13917a02")}</DialogTitle><DialogDescription>{target==='others'?t("m_2bf2e5f189"):target?.current?t("m_b634d749cb"):t("m_155509962b")}</DialogDescription>{error&&<p role="alert">{t(error || '')}</p>}<button data-dialog-cancel disabled={busy} onClick={()=>setTarget(null)}>{t("m_2cd0f3be87")}</button><button className="account-primary-button" disabled={busy} onClick={()=>void revoke()}>{busy?t("m_0ae60dd37b"):t("m_ab942a2cac")}</button></DialogContent></Dialog>
 </section>;
}