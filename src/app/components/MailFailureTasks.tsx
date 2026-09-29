import { notify } from '../lib/feedback';
import {useState} from 'react';
import {Link} from 'react-router-dom';
import {api} from '../lib/api';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
export function MailFailureTasks({count,onQueued}:{count:number;onQueued:()=>void}){
 const [open,setOpen]=useState(false),[items,setItems]=useState<any[]|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[target,setTarget]=useState<number|null>(null);
 async function load(){setError('');setBusy(true);try{setItems((await api('/admin/operations/mail-failures')).items);}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 async function retry(){setError('');setBusy(true);try{const r=await api('/admin/operations/mail-failures/'+target+'/retry',{method:'POST'});setTarget(null);setMessage(r.message);await load();onQueued();}catch(e:any){setError(e.message); notify.error(e.message);}finally{setBusy(false);}}
 if(!count&&!open)return null;
 return <div className="mail-failure-panel"><p>{count} 个通知邮件任务需要处理。</p><div className="inline-actions"><Link to="/admin/mail-settings">检查邮件设置</Link><Link to="/admin/runtime">查看任务进程</Link><button disabled={busy} onClick={()=>{setOpen(true);void load();}}>{open?'刷新任务状态':'查看失败任务'}</button></div>{message&&<p role="status">{message}</p>}{error&&!target&&<p role="alert">{error}</p>}{open&&<><p className="operations-note">先保存邮件配置并确认任务进程正常，再重试。刷新只读取状态，不会发送邮件；最多显示最近 20 项。</p>{items?.length===0?<p>当前没有失败任务。已重新排队的任务会由任务进程处理。</p>:items?.map(j=><div className="operations-todo" key={j.id}><div><strong>通知任务 #{j.id}</strong><p>{j.reason} 已尝试 {j.attempts} 次。</p></div><button className="engagement-button" disabled={busy} onClick={()=>{setError('');setTarget(j.id);}}>重试此任务</button></div>)}</>}
 <Dialog open={target!==null} onOpenChange={v=>{if(!v&&!busy)setTarget(null);}}><DialogContent className="workspace-form-dialog"><DialogTitle>重新发送这条通知？</DialogTitle><DialogDescription>请先确认邮件配置和任务进程已恢复。收件人仍订阅且内容可见时才会发送；如果上次已收到邮件，重试可能再次送达。</DialogDescription>{error&&<p role="alert">{error}</p>}<button data-dialog-cancel disabled={busy} onClick={()=>setTarget(null)}>取消</button><button className="account-primary-button" disabled={busy} onClick={()=>void retry()}>{busy?'正在排队…':'确认重新排队'}</button></DialogContent></Dialog></div>;
}
