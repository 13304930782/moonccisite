import { useI18n } from '../i18n';
import { articlePath } from '../lib/articleUrl';
import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {Link} from '../components/LocaleLink';
import {Plus,FileText,ArrowUpRight} from 'lucide-react';
import {api} from '../lib/api';
import {usePublishing} from '../lib/usePublishing';
export const workflowNames:Record<string,string>={draft:'草稿',submitted:'待审核',approved:'审核通过',rejected:'已退回',scheduled:'已安排发布',published:'已发布',failed:'发布失败'};
function updated(value:string,locale='zh-CN'){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString(locale,{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'';}
export default function SubmissionsPage(){
  const { locale,  t } = useI18n();
 const navigate=useNavigate();const enabled=usePublishing();const [page,setPage]=useState(1),[data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=()=>api('/article-drafts?mine=true&page='+page).then(r=>{setData(r);setError('');}).catch(e=>setError(e.message));
 useEffect(()=>{if(enabled)void load();},[page,enabled]);
 async function cancel(d:any){setBusy(true);try{await api('/publishing/'+d.id+'/cancel',{method:'POST',body:JSON.stringify({version:d.version})});navigate('/account/write?draft='+encodeURIComponent(d.id));}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 return <section className="submissions-page"><header className="account-page-heading"><div><span className="account-eyebrow">{t("m_43bb4524ff")}</span><h1>{t("m_aff9ef1e32")}</h1><p>{t("m_b8a266168c")}</p></div>{enabled&&<Link className="account-primary-button" to="/account/write"><Plus size={17}/>{t("m_6bbde83d85")}</Link>}</header>
 {error&&<div className="account-feedback" role="alert">{t(error || '')}<button onClick={()=>void load()}>{t("m_b8784c8dd5")}</button></div>}
 {!enabled?<div className="account-empty">{t("m_cc3b1f7227")}</div>:!data?<div className="account-empty" role="status">{t("m_29ab25efcb")}</div>:<>
 <div className="submission-list-panel"><div className="submission-list-heading"><h2>{t("m_3761f8b143")}</h2><span>{data.total}  {t("m_4e7b9204a9")}</span></div>
 {data.items.map((d:any)=>{const state=d.workflow?.state||'draft',locked=['submitted','approved','scheduled'].includes(state);return <article className="submission-row" key={d.id}><div className="submission-document-icon" aria-hidden="true"><FileText size={21}/></div><div className="submission-row-content"><div className="submission-row-heading"><h3><Link to={'/account/write?draft='+d.id}>{d.payload.title||t("m_865f0a03ab")}</Link></h3><span className={'submission-badge state-'+state}>{t(workflowNames[state]||'')}</span></div>
 <p className="submission-meta">{d.updated_at?t("m_7153f0918a")+updated(d.updated_at,locale):t("m_6fe1bb0fdb")}{d.workflow?.scheduled_at&&t("m_1b8f214860")+new Date(Number(d.workflow.scheduled_at)).toLocaleString(locale,{timeZone:'Asia/Shanghai'})}</p>
 {d.workflow?.reason&&<p className="submission-reason">{d.workflow.reason}</p>}<div className="submission-row-actions"><Link className="submission-open" to={'/account/write?draft='+d.id}>{locked?t("m_bc35b65fc5"):t("m_fd4b9e3b6c")}<ArrowUpRight size={14}/></Link>{['submitted','approved'].includes(state)&&<button disabled={busy} onClick={()=>void cancel(d)}>{t("m_6b2ae76f3b")}</button>}{d.post_id&&<Link to={articlePath({id:d.post_id,slug:d.post_slug})}>{t("m_f6beed2923")}</Link>}</div></div></article>;})}
 {!data.items.length&&<div className="account-empty"><FileText size={28}/><h3>{t("m_1f34b99a01")}</h3><p>{t("m_c462bcb8a8")}</p></div>}</div>
 {data.total>20&&<nav className="submission-pagination" aria-label={t("m_5d724056ff")}><button disabled={page===1} onClick={()=>setPage(page-1)}>{t("m_c9b9ae7a61")}</button><span>{t("m_af50a0fe2a")} {page} / {Math.ceil(data.total/20)}  {t("m_d24d3c9946")}</span><button disabled={page*20>=data.total} onClick={()=>setPage(page+1)}>{t("m_8a8542f696")}</button></nav>}
 </>}</section>;
}
