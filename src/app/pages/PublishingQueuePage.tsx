import { useI18n } from '../i18n';
import {useContentListQuery} from '../lib/useContentListQuery';
import {useEffect,useRef,useState, type CSSProperties} from 'react';
import {Inbox,FileText,CalendarClock,RefreshCw} from 'lucide-react';
import {api} from '../lib/api';
import {MarkdownContent} from '../components/MarkdownContent';
import {safeImageSrc} from '../lib/safeUrl';
import {CoverDisplayPreviews} from '../components/CoverDisplayPreviews';
import {AdminButton} from '../components/admin/AdminButton';
import {notify} from '../lib/feedback';
import {confirmAction} from '../lib/confirmAction';
import {useUnsavedLeave} from '../lib/useUnsavedLeave';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../components/ui/dialog';
import {workflowNames} from './SubmissionsPage';
import '../../styles/publishing.css';
import '../../styles/workspace-polish.css';
import '../../styles/admin-ui-v2.css';
import '../../styles/admin-publishing-queue.css';

const queueStates=['submitted','approved','scheduled','failed','rejected','published'];
const scheduledInput=(value:unknown)=>value?new Date(Number(value)+8*3600000).toISOString().slice(0,16):'';
export default function PublishingQueuePage({plans=false}:{plans?:boolean}){
  const { locale,  t } = useI18n();
 const {params,page,setPage,update:updateQuery}=useContentListQuery();const initial=params.get('state');
 const state=initial&&['submitted','approved','scheduled','failed','rejected','published'].includes(initial)?initial:plans?'scheduled':'submitted';
 // Radix retains the dialog during its exit animation; retain the manuscript too.
 const [reviewOpen,setReviewOpen]=useState(false);
 const [data,setData]=useState<any>(null),[selected,setSelected]=useState<any>(null),[reason,setReason]=useState(''),[date,setDate]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[reviewPane,setReviewPane]=useState('manuscript');
 const requestVersion=useRef(0),pending=useRef(false),closing=useRef(false),trigger=useRef<HTMLButtonElement|null>(null),filters=useRef<HTMLDivElement>(null),manuscript=useRef<HTMLElement>(null);
 const reviewDirty=reviewOpen&&(!!reason||date!==scheduledInput(selected?.scheduled_at));
 useUnsavedLeave(reviewDirty);
 async function closeReview(){if(busy||pending.current||closing.current)return;closing.current=true;try{if(!reviewDirty||await confirmAction(t('m_d87119f6cc')))setReviewOpen(false);}finally{closing.current=false;}}
 function openReview(d:any,button:HTMLButtonElement){trigger.current=button;setSelected(d);setReviewOpen(true);setReviewPane('manuscript');setReason('');setDate(scheduledInput(d.scheduled_at));setError('');setMessage('');}
 const queryKey=state+':'+page,currentQuery=useRef(queryKey);currentQuery.current=queryKey;
 const load=async()=>{if(currentQuery.current!==queryKey)return;const version=++requestVersion.current;setLoading(true);setLoadError('');try{const result=await api('/publishing/queue?state='+state+'&page='+page);if(version===requestVersion.current&&currentQuery.current===queryKey)setData(result);}catch(e:any){if(version===requestVersion.current&&currentQuery.current===queryKey)setLoadError(e.message);}finally{if(version===requestVersion.current&&currentQuery.current===queryKey)setLoading(false);}};
 useEffect(()=>{setReviewOpen(false);setData(null);void load();return()=>{requestVersion.current++;};},[state,page]);
 useEffect(()=>{filters.current?.querySelector('[aria-pressed=true]')?.scrollIntoView({block:'nearest',inline:'center',behavior:'auto'});},[state,locale]);
 async function action(kind:string){
  if(!reviewOpen||busy||pending.current||closing.current||!selected)return;
  pending.current=true;setBusy(true);setError('');setMessage('');
  try{
   await api('/publishing/'+selected.draft_id+'/'+kind,{method:'POST',body:JSON.stringify({version:selected.draft_version,reason,scheduled_at:date?new Date(date+':00+08:00').toISOString():undefined})});
   const result=({approve:t('m_1602e30295'),reject:t('m_978907703c'),publish:t('m_c0d1427d63'),schedule:t('m_0e3430221d'),cancel:t('m_a9212cc86d')} as Record<string,string>)[kind]||t('m_db8102ba6e');
   setReason('');
   if(kind==='approve'){setMessage(result);setSelected({...selected,state:'approved'});setReviewPane('actions');}
   else{setReviewOpen(false);notify.success(result);}
   await load();
  }catch(e:any){setError(e.message);}finally{pending.current=false;setBusy(false);}
 }
 const snapshot=selected?(typeof selected.snapshot==='string'?JSON.parse(selected.snapshot):selected.snapshot)||{}:{};
 return <section className="publishing-page queue-page ui-v2">
  <header className="workspace-heading"><div><h1>{plans?t('m_7f43c0e706'):t('m_fd95a33a4e')}</h1><p>{plans?t('m_9e8a2ed18b'):t('m_14db159265')}</p></div><AdminButton type="button" variant="soft" disabled={loading} onClick={()=>void load()}><RefreshCw size={16} aria-hidden="true"/>{t('刷新')}</AdminButton></header>
  {loadError&&<div className="queue-load-error" role="alert"><p>{t(loadError)}</p><AdminButton type="button" variant="soft" disabled={loading} onClick={()=>void load()}>{t('m_7bdd5ce1e2')}</AdminButton></div>}
  <div className="queue-panel">
   <div className="queue-toolbar"><div><h2>{plans?t('m_9823a28bca'):t('m_f20471737e')}</h2><span aria-live="polite">{loading?t('m_f020e4630a'):loadError?t('m_d1d044826a'):data?t('共 {count} 项',{count:data.total}):''}</span></div></div>
   <div className="queue-status-scroll"><div ref={filters} className="queue-status-tabs" role="group" aria-label={t('m_6320b4a872')} style={{'--queue-selected':queueStates.indexOf(state)} as CSSProperties}>{queueStates.map(x=><button key={x} type="button" aria-pressed={state===x} onClick={()=>updateQuery({state:x,page:''})}>{t(workflowNames[x]||'')}</button>)}</div></div>
   <div className="queue-results" aria-busy={loading}>
   {loading?<div className="workspace-empty" role="status">{t('m_9ee8e56b8f')}</div>:loadError||!data?null:!data.items.length?<div className="workspace-empty"><span className="workspace-empty-icon"><Inbox size={26} aria-hidden="true"/></span><h2>{t('m_b336a174cd')}{t(workflowNames[state]||'')}{t('m_34b17fd814')}</h2><p>{t('m_a1de773412')}</p>{(state!==(plans?'scheduled':'submitted')||page>1)&&<AdminButton type="button" variant="soft" onClick={()=>updateQuery({state:plans?'scheduled':'submitted',page:''})}>{plans?t('m_64300231e2'):t('m_50e2893931')}</AdminButton>}</div>:data.items.map((d:any)=><article className="queue-row" key={d.draft_id}><span className="queue-document-icon" aria-hidden="true"><FileText size={22}/></span><div className="queue-row-content"><h2>{d.title}</h2><p>{d.author_name} <span>·</span> {t('m_36a9478e43')} {d.draft_version}</p>{d.reason&&<p className="queue-reason">{d.reason}</p>}{d.scheduled_at&&<small><CalendarClock size={14} aria-hidden="true"/>{t('m_64e1e8d8ce')} {new Date(Number(d.scheduled_at)).toLocaleString(locale,{timeZone:'Asia/Shanghai'})}</small>}</div><div className="queue-row-actions"><span className={'workflow-badge workflow-'+d.state}>{t(workflowNames[d.state]||'')}</span><AdminButton type="button" variant="soft" onClick={event=>openReview(d,event.currentTarget)}>{t('m_d8e2644652')}</AdminButton></div></article>)}
   </div>
  </div>
  {data?.total>20&&<nav className="workspace-pagination" aria-label={t('m_41299d9be8')}><AdminButton type="button" variant="soft" disabled={loading||page===1} onClick={()=>setPage(page-1)}>{t('m_c9b9ae7a61')}</AdminButton><span aria-live="polite">{t('m_af50a0fe2a')} {page} {t('m_d24d3c9946')}</span><AdminButton type="button" variant="soft" disabled={loading||page*20>=data.total} onClick={()=>setPage(page+1)}>{t('m_8a8542f696')}</AdminButton></nav>}
  <Dialog open={reviewOpen} onOpenChange={open=>{if(!open)void closeReview();}}><DialogContent className="review-dialog publishing-review-dialog ui-v2" data-mobile-pane={reviewPane} aria-busy={busy} onOpenAutoFocus={event=>{event.preventDefault();manuscript.current?.focus({preventScroll:true});}} onCloseAutoFocus={event=>{const target=trigger.current?.isConnected?trigger.current:filters.current?.querySelector<HTMLButtonElement>('[aria-pressed=true]');if(target){event.preventDefault();target.focus({preventScroll:true});}}}>
   <header className="review-dialog-heading"><DialogTitle>{selected?.title}</DialogTitle><div className="review-dialog-meta"><DialogDescription>{selected?.author_name} {t('m_bf47570869')} {selected?.draft_version} {t('m_2cae6e862a')}</DialogDescription><span className={'workflow-badge workflow-'+selected?.state}>{t(workflowNames[selected?.state]||'')}</span></div>
    <div className="review-view-tabs" role="group" aria-label={t('审核视图')}><button type="button" aria-pressed={reviewPane==='manuscript'} onClick={()=>setReviewPane('manuscript')}>{t('稿件内容')}</button><button type="button" aria-pressed={reviewPane==='actions'} onClick={()=>setReviewPane('actions')}>{t('处理操作')}</button></div>
   </header>
   <div className="review-dialog-layout"><article ref={manuscript} tabIndex={-1} className="review-manuscript" aria-label={t('m_500af5dac1')}>{snapshot.summary&&<section className="review-summary"><h3>{t('简介')}</h3><p>{snapshot.summary}</p></section>}{safeImageSrc(snapshot.cover_image)&&<div className="review-cover">{snapshot.cover_crop?<CoverDisplayPreviews src={safeImageSrc(snapshot.cover_image)} crop={snapshot.cover_crop}/>:<figure><figcaption>{t('封面')}</figcaption><img src={safeImageSrc(snapshot.cover_image)} alt={t('封面')}/></figure>}</div>}{snapshot.content?<MarkdownContent content={snapshot.content} headingPrefix="review"/>:<p className="review-empty">{t('此版本没有正文。')}</p>}</article>
   <aside key={selected?.state} className="review-controls" aria-label={t('m_b4c4f07ad4')}>
    {message&&<p role="status" className="review-feedback">{t(message)}</p>}{error&&<p role="alert" className="review-error">{t(error)}</p>}{busy&&<p role="status" className="review-pending">{t('处理中…')}</p>}
    {selected?.state==='submitted'&&<><section className="review-action-group"><h2>{t('m_a1635a7845')}</h2><p>{t('m_0a994f97b9')}</p><AdminButton type="button" disabled={busy} onClick={()=>void action('approve')}>{t('m_a9b448e5d2')}</AdminButton></section><section className="review-action-group"><label>{t('m_451f108806')}<textarea disabled={busy} value={reason} rows={3} maxLength={1000} placeholder={t('m_b793f1eff4')} onChange={e=>setReason(e.target.value)}/></label><AdminButton type="button" variant="soft" className="ui-btn--danger" disabled={busy||!reason.trim()} onClick={()=>void action('reject')}>{t('m_0f30cbc430')}</AdminButton></section></>}
    {['approved','scheduled'].includes(selected?.state)&&<><section className="review-action-group"><h2>{t('立即发布')}</h2><p>{t('m_a9b8f30d25')}</p><AdminButton type="button" disabled={busy} onClick={()=>void action('publish')}>{t('m_214c4b462b')}</AdminButton></section><section className="review-action-group"><h2>{t('定时发布')}</h2><label>{t('m_624a0b1b4f')}<input disabled={busy} type="datetime-local" value={date} onChange={e=>setDate(e.target.value)}/></label><AdminButton type="button" variant="soft" disabled={busy||!date} onClick={()=>void action('schedule')}>{t('m_c2671b23b4')}</AdminButton></section></>}
    {selected?.reason&&<p className="queue-reason">{selected.reason}</p>}
    {['rejected','published'].includes(selected?.state)&&<p>{t('此状态仅供查看，无需操作。')}</p>}
    {['approved','scheduled','failed'].includes(selected?.state)&&<div className="review-secondary-actions"><AdminButton type="button" variant="soft" className="review-cancel" disabled={busy} onClick={()=>void action('cancel')}>{selected?.state==='scheduled'?t('m_fe3c08c632'):t('m_7ac7b01da2')}</AdminButton></div>}
   </aside></div>
  </DialogContent></Dialog>
 </section>;
}
