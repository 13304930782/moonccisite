import { notify } from '../lib/feedback';
import {useSearchParams} from 'react-router-dom';
import {useEffect,useState} from 'react';
import {Inbox,FileText,ArrowRight,CalendarClock} from 'lucide-react';
import {api} from '../lib/api';
import {MarkdownContent} from '../components/MarkdownContent';
import {safeImageSrc} from '../lib/safeUrl';
import {ThemeSelect} from '../components/ThemeSelect';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../components/ui/dialog';
import {workflowNames} from './SubmissionsPage';
import '../../styles/publishing.css';
import '../../styles/workspace-polish.css';
export default function PublishingQueuePage({plans=false}:{plans?:boolean}){
 const [params]=useSearchParams();const initial=params.get('state');
 // Radix retains the dialog during its exit animation; retain the manuscript too.
 const [reviewOpen,setReviewOpen]=useState(false);
 const [state,setState]=useState(initial&&['submitted','approved','scheduled','failed','rejected','published'].includes(initial)?initial:plans?'scheduled':'submitted'),[page,setPage]=useState(1),[data,setData]=useState<any>(null),[selected,setSelected]=useState<any>(null),[reason,setReason]=useState(''),[date,setDate]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const load=()=>api('/publishing/queue?state='+state+'&page='+page).then(r=>{setData(r);setError('');}).catch(e=>setError(e.message));
 useEffect(()=>{setReviewOpen(false);void load();},[state,page]);
 async function action(kind:string){if(!reviewOpen||busy||!selected)return;setBusy(true);setError('');try{await api('/publishing/'+selected.draft_id+'/'+kind,{method:'POST',body:JSON.stringify({version:selected.draft_version,reason,scheduled_at:date?new Date(date+':00+08:00').toISOString():undefined})});setReason('');setMessage(({approve:'审核已通过。接下来可立即发布，或安排发布时间。',reject:'已退回作者，修改意见可在我的投稿中查看。',publish:'文章已发布，可在已发布列表查看。',schedule:'发布计划已保存，可在发布计划中跟进。',cancel:'已返回草稿，作者可以继续修改。'} as Record<string,string>)[kind]||'操作已完成');if(kind==='approve'){setSelected({...selected,state:'approved'});}else{setReviewOpen(false);}await load();}catch(e:any){setError(e.message); notify.error(e.message);}finally{setBusy(false);}}
 const snapshot=selected?(typeof selected.snapshot==='string'?JSON.parse(selected.snapshot):selected.snapshot)||{}:{};
 return <section className="publishing-page queue-page"><header className="workspace-heading"><div><span className="workspace-eyebrow">内容发布</span><h1>{plans?'发布计划':'投稿审核'}</h1><p>{plans?'管理发布排期，跟进到期任务和发布结果。':'查看作者提交的版本，完成审核后选择发布方式。'}</p></div></header>
 {message&&!reviewOpen&&<p className="workspace-alert" role="status">{message}</p>}
 {!reviewOpen&&error&&<div className="workspace-alert" role="alert">{error}<button onClick={()=>void load()}>重新加载</button></div>}
 <div className="queue-panel"><div className="queue-toolbar"><div><h2>{plans?'发布任务':'稿件列表'}</h2><span>{data?data.total+' 篇':'正在加载'}</span></div><label>状态<ThemeSelect aria-label="状态" value={state} onValueChange={v=>{setState(v);setPage(1);}}>{['submitted','approved','scheduled','failed','rejected','published'].map(x=><option key={x} value={x}>{workflowNames[x]}</option>)}</ThemeSelect></label></div>
 {!data?<div className="workspace-empty" role="status">正在加载稿件…</div>:!data.items.length?<div className="workspace-empty"><span className="workspace-empty-icon"><Inbox size={26}/></span><h2>暂无{workflowNames[state]}的稿件</h2><p>新的投稿会显示在待审核列表。</p>{(state!==(plans?'scheduled':'submitted')||page>1)&&<button onClick={()=>{setState(plans?'scheduled':'submitted');setPage(1);}}>{plans?'查看待发布计划':'清除筛选，查看待审核投稿'}</button>}</div>:data.items.map((d:any)=><article className="queue-row" key={d.draft_id}><span className="queue-document-icon"><FileText size={22}/></span><div className="queue-row-content"><h2>{d.title}</h2><p>{d.author_name} <span>·</span> 提交版本 {d.draft_version}</p>{d.reason&&<p className="queue-reason">{d.reason}</p>}{d.scheduled_at&&<small><CalendarClock size={14}/>北京时间 {new Date(Number(d.scheduled_at)).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</small>}</div><div className="queue-row-actions"><span className={'workflow-badge workflow-'+d.state}>{workflowNames[d.state]}</span><button onClick={()=>{setSelected(d);setReviewOpen(true);setReason('');setDate(d.scheduled_at?new Date(Number(d.scheduled_at)+8*3600000).toISOString().slice(0,16):'');setError('');setMessage('');}}>查看并处理<ArrowRight size={15}/></button></div></article>)}</div>
 {data?.total>20&&<div className="workspace-pagination"><button disabled={page===1} onClick={()=>setPage(page-1)}>上一页</button><span>第 {page} 页</span><button disabled={page*20>=data.total} onClick={()=>setPage(page+1)}>下一页</button></div>}
 <Dialog open={reviewOpen} onOpenChange={open=>{if(!busy)setReviewOpen(open);}}><DialogContent className="review-dialog"><header className="review-dialog-heading"><span className="workspace-eyebrow">稿件审阅</span><DialogTitle>{selected?.title}</DialogTitle><DialogDescription>{selected?.author_name} · 提交版本 {selected?.draft_version} · 审核期间内容已锁定</DialogDescription></header>
 <div className="review-dialog-layout"><article className="review-manuscript" aria-label="稿件正文">{snapshot.summary&&<p className="review-summary">{snapshot.summary}</p>}{safeImageSrc(snapshot.cover_image)&&<img src={safeImageSrc(snapshot.cover_image)} alt=""/>}<MarkdownContent content={snapshot.content||''} headingPrefix="review"/></article>
 <aside className="review-controls" aria-label="审核操作">{message&&<p role="status">{message}</p>}<span className={'workflow-badge workflow-'+selected?.state}>{workflowNames[selected?.state]}</span>{error&&<p role="alert" className="workspace-alert">{error}</p>}
 {selected?.state==='submitted'&&<><h2>审核决定</h2><p>确认正文与图片后，通过审核或填写修改意见。</p><button className="workspace-primary" disabled={busy} onClick={()=>void action('approve')}>通过审核，安排发布</button><label>退回理由<textarea value={reason} maxLength={1000} placeholder="说明作者需要修改的内容" onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||!reason.trim()} onClick={()=>void action('reject')}>退回修改</button></>}
 {['approved','scheduled'].includes(selected?.state)&&<><h2>安排发布</h2><p>立即发布已审核版本，或设置未来的发布时间。</p><button className="workspace-primary" disabled={busy} onClick={()=>void action('publish')}>立即发布已审核版本</button><div className="review-control-divider"/><label>发布时间（北京时间）<input type="datetime-local" value={date} onChange={e=>setDate(e.target.value)}/></label><button disabled={busy||!date} onClick={()=>void action('schedule')}>保存发布计划</button></>}
 {selected?.reason&&<p>{selected.reason}</p>}{['approved','scheduled','failed'].includes(selected?.state)&&<button className="review-cancel" disabled={busy} onClick={()=>void action('cancel')}>{selected?.state==='scheduled'?'取消发布计划并退回草稿':'退回草稿重新修改'}</button>}
 </aside></div></DialogContent></Dialog></section>;
}
