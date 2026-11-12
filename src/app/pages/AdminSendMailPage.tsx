import { useI18n } from '../i18n';
import {notify} from '../lib/feedback';
import {ActionProgress,waitActionSuccess} from '../components/ActionProgress';
import {FormEvent,useRef,useState} from 'react';
import {CheckCircle2,CircleAlert,Send} from 'lucide-react';
import {useUnsavedLeave} from '../lib/useUnsavedLeave';
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
  const { locale,  t } = useI18n();
 const [form,setForm]=useState<Fields>({to:'',subject:'',content:''}),[errors,setErrors]=useState<Partial<Fields>>({}),[sending,setSending]=useState(false),[completed,setCompleted]=useState(false),[result,setResult]=useState<Result|null>(null),[checked,setChecked]=useState(false);
 useUnsavedLeave(Boolean(form.subject || form.content));
 const pending=useRef(false),formRef=useRef<HTMLFormElement>(null);
 function validate(values:Fields){const e:Partial<Fields>={};if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.to.trim()))e.to=t("m_8eb3968a27");if(!values.subject.trim())e.subject=t("m_b7b943dd05");else if(values.subject.length>120)e.subject=t("m_f985a3d922");if(!values.content.trim())e.content=t("m_74b3da50e8");else if(values.content.length>5000)e.content=t("m_b1d6541bf5");return e;}
 function change(key:keyof Fields,value:string){const next={...form,[key]:value};setForm(next);if(errors[key])setErrors({...errors,[key]:validate(next)[key]});}
 async function submit(event:FormEvent){event.preventDefault();if(pending.current||(result?.kind==='uncertain'&&!checked))return;const e=validate(form);setErrors(e);if(Object.keys(e).length){const first=Object.keys(e)[0];formRef.current?.querySelector<HTMLElement>(`#mail-${first}`)?.focus();return;}
  pending.current=true;setSending(true);setCompleted(false);const snapshot={...form,time:new Date().toLocaleString(locale,{timeZone:'Asia/Shanghai'})};setResult(null);setChecked(false);
  try{await api('/settings/mail/send-custom',{method:'POST',body:JSON.stringify(form)});setCompleted(true);await waitActionSuccess();setResult({kind:'success',message:t("m_72c52a1124"),...snapshot});setForm({...form,subject:'',content:''});notify.success(t("m_b8b321583f"));}
  catch(error){const err=error as ApiError;const message=err.uncertain?t("m_104c8e0bd5"):messages[err.message]||err.message||t("m_ac9cc8827e");setResult({kind:err.uncertain?'uncertain':'error',message,...snapshot});}
  finally{pending.current=false;setSending(false);setCompleted(false);}
 }
 return <div className="admin-page"><section className="mail-compose workflow-feedback"><header><h1 className="admin-title">{t("m_2ea2bbfe61")}</h1><p>{t("m_469210f5a9")}</p></header>
 {result&&<section className="workflow-result" role={result.kind==='success'?'status':'alert'}>{result.kind==='success'?<CheckCircle2 size={20} aria-hidden="true"/>:<CircleAlert size={20} aria-hidden="true"/>}<div className="workflow-result-body"><h2>{result.kind==='success'?t("m_b8b321583f"):result.kind==='uncertain'?t("m_59a6195bd5"):t("m_911a652b2c")}</h2><p>{result.message}</p><p>{t("m_6bc760d059")}{result.to}<br/>{t("m_c08ae19b28")}{result.subject}<br/>{t("m_d022443974")}{result.time}</p>{result.kind==='uncertain'&&<><details className="workflow-warning-details"><summary>{t("m_e5f090a508")}</summary><p>{t("m_c30afb1596")}</p></details><label className="mail-recheck"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>{t("m_9b611528eb")}</label></>}</div></section>}
 <form ref={formRef} onSubmit={submit} noValidate aria-busy={sending}>{(Object.keys(labels) as (keyof Fields)[]).map(key=><div key={key}><label htmlFor={`mail-${key}`}>{t(labels[key])}</label>{key==='content'?<textarea id={`mail-${key}`} value={form[key]} onChange={e=>change(key,e.target.value)} rows={9} disabled={sending} aria-invalid={!!errors[key]} aria-describedby={errors[key]?`mail-${key}-error`:'mail-content-hint'}/>:<input id={`mail-${key}`} type={key==='to'?'email':'text'} autoComplete={key==='to'?'email':'off'} value={form[key]} onChange={e=>change(key,e.target.value)} disabled={sending} aria-invalid={!!errors[key]} aria-describedby={errors[key]?`mail-${key}-error`:key==='subject'?'mail-subject-hint':undefined}/>} {errors[key]&&<p className="mail-field-error" id={`mail-${key}-error`}><CircleAlert size={16} aria-hidden="true"/>{t(errors[key] || "")}</p>}{key!=='to'&&<p className="mail-hint" id={`mail-${key}-hint`}>{key==='subject'?t("m_c151991276"):t("m_bdf41666dd")}</p>}</div>)}<footer><p className="mail-hint" role="status">{sending?t("m_637a207e72"):t("m_92bd3ca990")}</p><button className="workflow-button workflow-primary" disabled={sending||(result?.kind==='uncertain'&&!checked)}>{sending?<ActionProgress success={completed}/>:<Send size={16} aria-hidden="true"/>}{completed?t("m_60823aaec7"):sending?t("m_22eb0f8779"):result?.kind==='uncertain'?t("m_29f412e564"):t("m_c268c1b1ce")}</button></footer></form></section></div>;
}
