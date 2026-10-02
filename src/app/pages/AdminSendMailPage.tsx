import {notify} from '../lib/feedback';
import {FormEvent,useRef,useState} from 'react';
import {CheckCircle2,CircleAlert,Send} from 'lucide-react';
import {api,ApiError} from '../lib/api';
import '../../styles/workflow-feedback.css';
type Fields={to:string;subject:string;content:string};
type Result={kind:'success'|'error'|'uncertain';message:string;to:string;subject:string;time:string};
const labels:Record<keyof Fields,string>={to:'收件人邮箱',subject:'邮件标题',content:'邮件内容'};
const messages:Record<string,string>={
 'Custom emails can only be sent to active registered users.':'只能向本站状态正常的注册用户发送邮件，请核对收件人邮箱。',
 'Daily custom email limit reached.':'今日发送次数已达上限，请明天再试。',
 'A valid recipient email is required.':'请输入完整的收件人邮箱，例如 name@example.com。',
 'Email subject is required.':'请填写邮件标题。','Email content is required.':'请填写邮件内容。'
};
export default function AdminSendMailPage(){
 const [form,setForm]=useState<Fields>({to:'',subject:'',content:''}),[errors,setErrors]=useState<Partial<Fields>>({}),[sending,setSending]=useState(false),[result,setResult]=useState<Result|null>(null),[checked,setChecked]=useState(false);
 const pending=useRef(false),formRef=useRef<HTMLFormElement>(null);
 function validate(values:Fields){const e:Partial<Fields>={};if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.to.trim()))e.to='请输入完整的邮箱，例如 name@example.com。';if(!values.subject.trim())e.subject='请填写邮件标题。';else if(values.subject.length>120)e.subject='邮件标题请控制在 120 字以内。';if(!values.content.trim())e.content='请填写邮件内容。';else if(values.content.length>5000)e.content='邮件内容请控制在 5000 字以内。';return e;}
 function change(key:keyof Fields,value:string){const next={...form,[key]:value};setForm(next);if(errors[key])setErrors({...errors,[key]:validate(next)[key]});}
 async function submit(event:FormEvent){event.preventDefault();if(pending.current||(result?.kind==='uncertain'&&!checked))return;const e=validate(form);setErrors(e);if(Object.keys(e).length){const first=Object.keys(e)[0];formRef.current?.querySelector<HTMLElement>(`#mail-${first}`)?.focus();return;}
  pending.current=true;setSending(true);const snapshot={...form,time:new Date().toLocaleString()};setResult(null);setChecked(false);
  try{await api('/settings/mail/send-custom',{method:'POST',body:JSON.stringify(form)});setResult({kind:'success',message:'发送请求已完成。实际送达情况可向收件人核对。',...snapshot});setForm({...form,subject:'',content:''});notify.success('邮件已发送');}
  catch(error){const err=error as ApiError;const message=err.uncertain?'请求中断后，服务器可能已完成发送。请先核对发送记录，再决定是否重发。':messages[err.message]||err.message||'发送未完成，请检查后重试。';setResult({kind:err.uncertain?'uncertain':'error',message,...snapshot});notify.error(err.uncertain?'邮件发送结果尚未确认':message);}
  finally{pending.current=false;setSending(false);}
 }
 return <div className="admin-page"><section className="mail-compose workflow-feedback"><header><h1 className="admin-title">站点通知</h1><p>使用站点邮箱向状态正常的注册用户发送通知。个人对外发信请使用“我的邮箱”。</p></header>
 {result&&<section className="workflow-result" role={result.kind==='success'?'status':'alert'}>{result.kind==='success'?<CheckCircle2 size={20} aria-hidden="true"/>:<CircleAlert size={20} aria-hidden="true"/>}<div className="workflow-result-body"><h2>{result.kind==='success'?'邮件已发送':result.kind==='uncertain'?'尚未确认发送结果':'邮件未发送成功'}</h2><p>{result.message}</p><p>收件人：{result.to}<br/>标题：{result.subject}<br/>提交时间：{result.time}</p>{result.kind==='uncertain'&&<><details className="workflow-warning-details"><summary>如何核对发送结果</summary><p>先询问收件人是否收到邮件，或在邮件服务商后台按上方收件人、标题和时间核对发送记录。当前页面无法自动确认是否送达，请勿直接重复发送。</p></details><label className="mail-recheck"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>我已核对，确认需要重新发送</label></>}</div></section>}
 <form ref={formRef} onSubmit={submit} noValidate aria-busy={sending}>{(Object.keys(labels) as (keyof Fields)[]).map(key=><div key={key}><label htmlFor={`mail-${key}`}>{labels[key]}</label>{key==='content'?<textarea id={`mail-${key}`} value={form[key]} onChange={e=>change(key,e.target.value)} rows={9} disabled={sending} aria-invalid={!!errors[key]} aria-describedby={errors[key]?`mail-${key}-error`:'mail-content-hint'}/>:<input id={`mail-${key}`} type={key==='to'?'email':'text'} autoComplete={key==='to'?'email':'off'} value={form[key]} onChange={e=>change(key,e.target.value)} disabled={sending} aria-invalid={!!errors[key]} aria-describedby={errors[key]?`mail-${key}-error`:key==='subject'?'mail-subject-hint':undefined}/>} {errors[key]&&<p className="mail-field-error" id={`mail-${key}-error`}><CircleAlert size={16} aria-hidden="true"/>{errors[key]}</p>}{key!=='to'&&<p className="mail-hint" id={`mail-${key}-hint`}>{key==='subject'?'标题最多 120 字。':'正文最多 5000 字，支持换行。'}</p>}</div>)}<footer><p className="mail-hint" role="status">{sending?'正在发送，请稍候…':'发送失败时会保留已填写的内容。'}</p><button className="workflow-button workflow-primary" disabled={sending||(result?.kind==='uncertain'&&!checked)}><Send size={16} aria-hidden="true"/>{sending?'正在发送…':result?.kind==='uncertain'?'确认重新发送':'发送邮件'}</button></footer></form></section></div>;
}
