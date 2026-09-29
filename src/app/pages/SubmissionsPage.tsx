import { notify } from '../lib/feedback';
import {useEffect,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {Plus,FileText,ArrowUpRight} from 'lucide-react';
import {api} from '../lib/api';
import {usePublishing} from '../lib/usePublishing';
export const workflowNames:Record<string,string>={draft:'草稿',submitted:'待审核',approved:'审核通过',rejected:'已退回',scheduled:'已安排发布',published:'已发布',failed:'发布失败'};
function updated(value:string){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'';}
export default function SubmissionsPage(){
 const navigate=useNavigate();const enabled=usePublishing();const [page,setPage]=useState(1),[data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=()=>api('/article-drafts?mine=true&page='+page).then(r=>{setData(r);setError('');}).catch(e=>setError(e.message));
 useEffect(()=>{if(enabled)void load();},[page,enabled]);
 async function cancel(d:any){setBusy(true);try{await api('/publishing/'+d.id+'/cancel',{method:'POST',body:JSON.stringify({version:d.version})});navigate('/account/write?draft='+encodeURIComponent(d.id));}catch(e:any){setError(e.message); notify.error(e.message);}finally{setBusy(false);}}
 return <section className="submissions-page"><header className="account-page-heading"><div><span className="account-eyebrow">创作与发布</span><h1>我的投稿</h1><p>管理草稿，查看审核进度与发布结果。</p></div>{enabled&&<Link className="account-primary-button" to="/account/write"><Plus size={17}/>开始写作</Link>}</header>
 {error&&<div className="account-feedback" role="alert">{error}<button onClick={()=>void load()}>重试</button></div>}
 {!enabled?<div className="account-empty">投稿功能尚未开启。</div>:!data?<div className="account-empty" role="status">正在读取投稿…</div>:<>
 <div className="submission-list-panel"><div className="submission-list-heading"><h2>全部稿件</h2><span>{data.total} 篇</span></div>
 {data.items.map((d:any)=>{const state=d.workflow?.state||'draft',locked=['submitted','approved','scheduled'].includes(state);return <article className="submission-row" key={d.id}><div className="submission-document-icon" aria-hidden="true"><FileText size={21}/></div><div className="submission-row-content"><div className="submission-row-heading"><h3><Link to={'/account/write?draft='+d.id}>{d.payload.title||'未命名草稿'}</Link></h3><span className={'submission-badge state-'+state}>{workflowNames[state]}</span></div>
 <p className="submission-meta">{d.updated_at?'更新于 '+updated(d.updated_at):'稿件已保存'}{d.workflow?.scheduled_at&&' · 计划发布：'+new Date(Number(d.workflow.scheduled_at)).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</p>
 {d.workflow?.reason&&<p className="submission-reason">{d.workflow.reason}</p>}<div className="submission-row-actions"><Link className="submission-open" to={'/account/write?draft='+d.id}>{locked?'查看稿件':'继续编辑'}<ArrowUpRight size={14}/></Link>{['submitted','approved'].includes(state)&&<button disabled={busy} onClick={()=>void cancel(d)}>撤回审核并编辑</button>}{d.post_id&&<Link to={'/article/'+d.post_id}>查看文章</Link>}</div></div></article>;})}
 {!data.items.length&&<div className="account-empty"><FileText size={28}/><h3>从第一篇草稿开始</h3><p>保存想法，慢慢完善，准备好后提交审核。</p></div>}</div>
 {data.total>20&&<nav className="submission-pagination" aria-label="稿件分页"><button disabled={page===1} onClick={()=>setPage(page-1)}>上一页</button><span>第 {page} / {Math.ceil(data.total/20)} 页</span><button disabled={page*20>=data.total} onClick={()=>setPage(page+1)}>下一页</button></nav>}
 </>}</section>;
}
